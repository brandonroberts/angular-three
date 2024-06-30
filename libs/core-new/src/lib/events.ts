import { Subject } from 'rxjs';
import { Intersection, Object3D, OrthographicCamera, PerspectiveCamera, Ray, Vector2, Vector3 } from 'three';
import { getLocalState } from './instance';
import { NgtState } from './store';
import { NgtAnyRecord, NgtProperties } from './types';
import { makeId } from './utils/make';
import { NgtSignalStore } from './utils/signal-store';

export interface NgtIntersection extends Intersection {
	/** The event source (the object which registered the handler) */
	eventObject: Object3D;
}

export interface NgtIntersectionEvent<TSourceEvent> extends NgtIntersection {
	/** The event source (the object which registered the handler) */
	eventObject: Object3D;
	/** An array of intersections */
	intersections: NgtIntersection[];
	/** vec3.set(pointer.x, pointer.y, 0).unproject(camera) */
	unprojectedPoint: Vector3;
	/** Normalized event coordinates */
	pointer: Vector2;
	/** Delta between first click and this event */
	delta: number;
	/** The ray that pierced it */
	ray: Ray;
	/** The camera that was used by the raycaster */
	camera: NgtCamera;
	/** stopPropagation will stop underlying handlers from firing */
	stopPropagation: () => void;
	/** The original host event */
	nativeEvent: TSourceEvent;
	/** If the event was stopped by calling stopPropagation */
	stopped: boolean;
}

export type NgtCamera = OrthographicCamera | PerspectiveCamera;
export type NgtThreeEvent<TEvent> = NgtIntersectionEvent<TEvent> & NgtProperties<TEvent>;
export type NgtDomEvent = PointerEvent | MouseEvent | WheelEvent;

export interface NgtEventHandlers {
	click?: (event: NgtThreeEvent<MouseEvent>) => void;
	contextmenu?: (event: NgtThreeEvent<MouseEvent>) => void;
	dblclick?: (event: NgtThreeEvent<MouseEvent>) => void;
	pointerup?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointerdown?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointerover?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointerout?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointerenter?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointerleave?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointermove?: (event: NgtThreeEvent<PointerEvent>) => void;
	pointermissed?: (event: MouseEvent) => void;
	pointercancel?: (event: NgtThreeEvent<PointerEvent>) => void;
	wheel?: (event: NgtThreeEvent<WheelEvent>) => void;
}

export type NgtEvents = {
	[TEvent in keyof NgtEventHandlers]-?: EventListener;
};

export type NgtFilterFunction = (items: Intersection[], store: NgtSignalStore<NgtState>) => Intersection[];
export type NgtComputeFunction = (
	event: NgtDomEvent,
	root: NgtSignalStore<NgtState>,
	previous?: NgtSignalStore<NgtState> | null,
) => void;

export interface NgtEventManager<TTarget> {
	/** Determines if the event layer is active */
	enabled: boolean;
	/** Event layer priority, higher prioritized layers come first and may stop(-propagate) lower layer  */
	priority: number;
	/** The compute function needs to set up the raycaster and an xy- pointer  */
	compute?: NgtComputeFunction;
	/** The filter can re-order or re-structure the intersections  */
	filter?: NgtFilterFunction;
	/** The target node the event layer is tied to */
	connected?: TTarget;
	/** All the pointer event handlers through which the host forwards native events */
	handlers?: NgtEvents;
	/** Allows re-connecting to another target */
	connect?: (target: TTarget) => void;
	/** Removes all existing events handlers from the target */
	disconnect?: () => void;
	/** Triggers a onPointerMove with the last known event. This can be useful to enable raycasting without
	 *  explicit user interaction, for instance when the camera moves a hoverable object underneath the cursor.
	 */
	update?: () => void;
}

export interface NgtPointerCaptureTarget {
	intersection: NgtIntersection;
	target: Element;
}

/**
 * Release pointer captures.
 * This is called by releasePointerCapture in the API, and when an object is removed.
 */
function releaseInternalPointerCapture(
	capturedMap: Map<number, Map<Object3D, NgtPointerCaptureTarget>>,
	obj: Object3D,
	captures: Map<Object3D, NgtPointerCaptureTarget>,
	pointerId: number,
): void {
	const captureData: NgtPointerCaptureTarget | undefined = captures.get(obj);
	if (captureData) {
		captures.delete(obj);
		// If this was the last capturing object for this pointer
		if (captures.size === 0) {
			capturedMap.delete(pointerId);
			captureData.target.releasePointerCapture(pointerId);
		}
	}
}

export function removeInteractivity(store: NgtSignalStore<NgtState>, object: Object3D) {
	const { internal } = store.snapshot;
	// Removes every trace of an object from the data store
	internal.interaction = internal.interaction.filter((o) => o !== object);
	internal.initialHits = internal.initialHits.filter((o) => o !== object);
	internal.hovered.forEach((value, key) => {
		if (value.eventObject === object || value.object === object) {
			// Clear out intersects, they are outdated by now
			internal.hovered.delete(key);
		}
	});
	internal.capturedMap.forEach((captures, pointerId) => {
		releaseInternalPointerCapture(internal.capturedMap, object, captures, pointerId);
	});
}

export function createEvents(store: NgtSignalStore<NgtState>) {
	/** Calculates delta */
	function calculateDistance(event: NgtDomEvent) {
		const { internal } = store.snapshot;
		const dx = event.offsetX - internal.initialClick[0];
		const dy = event.offsetY - internal.initialClick[1];
		return Math.round(Math.sqrt(dx * dx + dy * dy));
	}

	/** Returns true if an instance has a valid pointer-event registered, this excludes scroll, clicks etc */
	function filterPointerEvents(objects: Object3D[]) {
		return objects.filter((obj) =>
			['move', 'over', 'enter', 'out', 'leave'].some((name) => {
				const eventName = `pointer${name}` as keyof NgtEventHandlers;
				return getLocalState(obj)?.handlers?.[eventName];
			}),
		);
	}

	function intersect(event: NgtDomEvent, filter?: (objects: Object3D[]) => Object3D[]) {
		const state = store.snapshot;
		const duplicates = new Set<string>();
		const intersections: NgtIntersection[] = [];
		// Allow callers to eliminate event objects
		const eventsObjects = filter ? filter(state.internal.interaction) : state.internal.interaction;
		// Reset all raycaster cameras to undefined
		for (let i = 0; i < eventsObjects.length; i++) {
			const objState = getLocalState(eventsObjects[i])?.store.snapshot;
			if (objState) {
				objState.raycaster.camera = undefined!;
			}
		}

		if (!state.previousRoot) {
			// Make sure root-level pointer and ray are set up
			state.events.compute?.(event, store);
		}

		function handleRaycast(obj: Object3D) {
			const store = getLocalState(obj)?.store;
			const state = store?.snapshot;
			// Skip event handling when noEvents is set, or when the raycasters camera is null
			if (!state || !state.events.enabled || state.raycaster.camera === null) return [];

			// When the camera is undefined we have to call the event layers update function
			if (state.raycaster.camera === undefined) {
				state.events.compute?.(event, store, state.previousRoot);
				// If the camera is still undefined we have to skip this layer entirely
				if (state.raycaster.camera === undefined) state.raycaster.camera = null!;
			}

			// Intersect object by object
			return state.raycaster.camera ? state.raycaster.intersectObject(obj, true) : [];
		}

		// Collect events
		let hits: Intersection<Object3D>[] = eventsObjects
			// Intersect objects
			.flatMap(handleRaycast)
			// Sort by event priority and distance
			.sort((a, b) => {
				const aState = getLocalState(a.object)?.store.snapshot;
				const bState = getLocalState(b.object)?.store.snapshot;
				if (!aState || !bState) return a.distance - b.distance;
				return bState.events.priority - aState.events.priority || a.distance - b.distance;
			})
			// Filter out duplicates
			.filter((item) => {
				const id = makeId(item as NgtIntersection);
				if (duplicates.has(id)) return false;
				duplicates.add(id);
				return true;
			});

		// https://github.com/mrdoob/three.js/issues/16031
		// Allow custom userland intersect sort order, this likely only makes sense on the root filter
		if (state.events.filter) hits = state.events.filter(hits, store);

		// Bubble up the events, find the event source (eventObject)
		for (const hit of hits) {
			let eventObject: Object3D | null = hit.object;
			// Bubble event up
			while (eventObject) {
				if (getLocalState(eventObject)?.eventCount) intersections.push({ ...hit, eventObject });
				eventObject = eventObject.parent;
			}
		}

		// If the interaction is captured, make all capturing targets part of the intersect.
		if ('pointerId' in event && state.internal.capturedMap.has(event.pointerId)) {
			for (let captureData of state.internal.capturedMap.get(event.pointerId)!.values()) {
				if (!duplicates.has(makeId(captureData.intersection))) intersections.push(captureData.intersection);
			}
		}

		return intersections;
	}

	/**  Handles intersections by forwarding them to handlers */
	function handleIntersects(
		intersections: NgtIntersection[],
		event: NgtDomEvent,
		delta: number,
		callback: (event: NgtThreeEvent<NgtDomEvent>) => void,
	) {
		const rootState = store.snapshot;

		// If anything has been found, forward it to the event listeners
		if (intersections.length) {
			const localState = { stopped: false };

			for (const hit of intersections) {
				const state = getLocalState(hit.object)?.store.snapshot || rootState;
				const { raycaster, pointer, camera, internal } = state;
				const unprojectedPoint = new Vector3(pointer.x, pointer.y, 0).unproject(camera);
				const hasPointerCapture = (id: number) => internal.capturedMap.get(id)?.has(hit.eventObject) ?? false;

				const setPointerCapture = (id: number) => {
					const captureData = { intersection: hit, target: event.target as Element };
					if (internal.capturedMap.has(id)) {
						// if the pointerId was previously captured, we add the hit to the
						// event capturedMap.
						internal.capturedMap.get(id)!.set(hit.eventObject, captureData);
					} else {
						// if the pointerId was not previously captured, we create a map
						// containing the hitObject, and the hit. hitObject is used for
						// faster access.
						internal.capturedMap.set(id, new Map([[hit.eventObject, captureData]]));
					}
					// Call the original event now
					(event.target as Element).setPointerCapture(id);
				};

				const releasePointerCapture = (id: number) => {
					const captures = internal.capturedMap.get(id);
					if (captures) {
						releaseInternalPointerCapture(internal.capturedMap, hit.eventObject, captures, id);
					}
				};

				// Add native event props
				const extractEventProps: NgtAnyRecord = {};
				// This iterates over the event's properties including the inherited ones. Native PointerEvents have most of their props as getters which are inherited, but polyfilled PointerEvents have them all as their own properties (i.e. not inherited). We can't use Object.keys() or Object.entries() as they only return "own" properties; nor Object.getPrototypeOf(event) as that *doesn't* return "own" properties, only inherited ones.
				for (let prop in event) {
					const property = event[prop as keyof NgtDomEvent];
					// Only copy over atomics, leave functions alone as these should be
					// called as event.nativeEvent.fn()
					if (typeof property !== 'function') extractEventProps[prop] = property;
				}

				const raycastEvent: NgtThreeEvent<NgtDomEvent> = {
					...hit,
					...extractEventProps,
					pointer,
					intersections,
					stopped: localState.stopped,
					delta,
					unprojectedPoint,
					ray: raycaster.ray,
					camera: camera,
					// Hijack stopPropagation, which just sets a flag
					stopPropagation() {
						// https://github.com/pmndrs/react-three-fiber/issues/596
						// Events are not allowed to stop propagation if the pointer has been captured
						const capturesForPointer = 'pointerId' in event && internal.capturedMap.get(event.pointerId);

						// We only authorize stopPropagation...
						if (
							// ...if this pointer hasn't been captured
							!capturesForPointer ||
							// ... or if the hit object is capturing the pointer
							capturesForPointer.has(hit.eventObject)
						) {
							raycastEvent.stopped = localState.stopped = true;
							// Propagation is stopped, remove all other hover records
							// An event handler is only allowed to flush other handlers if it is hovered itself
							if (
								internal.hovered.size &&
								Array.from(internal.hovered.values()).find((i) => i.eventObject === hit.eventObject)
							) {
								// Objects cannot flush out higher up objects that have already caught the event
								const higher = intersections.slice(0, intersections.indexOf(hit));
								cancelPointer([...higher, hit]);
							}
						}
					},
					// there should be a distinction between target and currentTarget
					// @ts-expect-error
					target: { hasPointerCapture, setPointerCapture, releasePointerCapture },
					// @ts-expect-error
					currentTarget: { hasPointerCapture, setPointerCapture, releasePointerCapture },
					nativeEvent: event,
				};

				// Call subscribers
				callback(raycastEvent);
				// Event bubbling may be interrupted by stopPropagation
				if (localState.stopped === true) break;
			}
		}

		return intersections;
	}

	function cancelPointer(intersections: NgtIntersection[]) {
		const { internal } = store.snapshot;
		for (const hoveredObj of internal.hovered.values()) {
			// When no objects were hit or the the hovered object wasn't found underneath the cursor
			// we call onPointerOut and delete the object from the hovered-elements map
			if (
				!intersections.length ||
				!intersections.find(
					(hit) =>
						hit.object === hoveredObj.object &&
						hit.index === hoveredObj.index &&
						hit.instanceId === hoveredObj.instanceId,
				)
			) {
				const eventObject = hoveredObj.eventObject;
				const instance = getLocalState(eventObject);
				const handlers = instance?.handlers;
				internal.hovered.delete(makeId(hoveredObj));
				if (instance?.eventCount) {
					// Clear out intersects, they are outdated by now
					const data = { ...hoveredObj, intersections };
					handlers?.pointerout?.(data as NgtThreeEvent<PointerEvent>);
					handlers?.pointerleave?.(data as NgtThreeEvent<PointerEvent>);
				}
			}
		}
	}

	function pointerMissed(event: MouseEvent, objects: Object3D[]) {
		for (let i = 0; i < objects.length; i++) {
			const instance = getLocalState(objects[i]);
			instance?.handlers.pointermissed?.(event);
		}
	}

	function handlePointer(name: string) {
		// Deal with cancelation
		switch (name) {
			case 'pointerleave':
			case 'pointercancel':
				return () => cancelPointer([]);
			case 'lostpointercapture':
				return (event: NgtDomEvent) => {
					const { internal } = store.snapshot;
					if ('pointerId' in event && internal.capturedMap.has(event.pointerId)) {
						// If the object event interface had onLostPointerCapture, we'd call it here on every
						// object that's getting removed. We call it on the next frame because onLostPointerCapture
						// fires before onPointerUp. Otherwise pointerUp would never be called if the event didn't
						// happen in the object it originated from, leaving components in a in-between state.
						requestAnimationFrame(() => {
							// Only release if pointer-up didn't do it already
							if (internal.capturedMap.has(event.pointerId)) {
								internal.capturedMap.delete(event.pointerId);
								cancelPointer([]);
							}
						});
					}
				};
		}

		// Any other pointer goes here ...
		return function handleEvent(event: NgtDomEvent) {
			// NOTE: pointerMissed$ on NgtStore is private
			const pointerMissed$: Subject<MouseEvent> = (store as NgtAnyRecord)['pointerMissed$'];
			const { internal } = store.snapshot;

			// prepareRay(event)
			internal.lastEvent.nativeElement = event;

			// Get fresh intersects
			const isPointerMove = name === 'pointermove';
			const isClickEvent = name === 'click' || name === 'contextmenu' || name === 'dblclick';
			const filter = isPointerMove ? filterPointerEvents : undefined;

			const hits = intersect(event, filter);
			const delta = isClickEvent ? calculateDistance(event) : 0;

			// Save initial coordinates on pointer-down
			if (name === 'pointerdown') {
				internal.initialClick = [event.offsetX, event.offsetY];
				internal.initialHits = hits.map((hit) => hit.eventObject);
			}

			// If a click yields no results, pass it back to the user as a miss
			// Missed events have to come first in order to establish user-land side-effect clean up
			if (isClickEvent && !hits.length) {
				if (delta <= 2) {
					pointerMissed(event, internal.interaction);
					pointerMissed$.next(event);
				}
			}
			// Take care of unhover
			if (isPointerMove) cancelPointer(hits);

			function onIntersect(data: NgtThreeEvent<NgtDomEvent>) {
				const eventObject = data.eventObject;
				const instance = getLocalState(eventObject);

				// Check presence of handlers
				if (!instance?.eventCount) return;

				const handlers = instance.handlers;

				/*
        MAYBE TODO, DELETE IF NOT:
          Check if the object is captured, captured events should not have intersects running in parallel
          But wouldn't it be better to just replace capturedMap with a single entry?
          Also, are we OK with straight up making picking up multiple objects impossible?

        const pointerId = (data as ThreeEvent<PointerEvent>).pointerId
        if (pointerId !== undefined) {
          const capturedMeshSet = internal.capturedMap.get(pointerId)
          if (capturedMeshSet) {
            const captured = capturedMeshSet.get(eventObject)
            if (captured && captured.localState.stopped) return
          }
        }*/

				if (isPointerMove) {
					// Move event ...
					if (handlers.pointerover || handlers.pointerenter || handlers.pointerout || handlers.pointerleave) {
						// When enter or out is present take care of hover-state
						const id = makeId(data);
						const hoveredItem = internal.hovered.get(id);
						if (!hoveredItem) {
							// If the object wasn't previously hovered, book it and call its handler
							internal.hovered.set(id, data);
							handlers.pointerover?.(data as NgtThreeEvent<PointerEvent>);
							handlers.pointerenter?.(data as NgtThreeEvent<PointerEvent>);
						} else if (hoveredItem.stopped) {
							// If the object was previously hovered and stopped, we shouldn't allow other items to proceed
							data.stopPropagation();
						}
					}
					// Call mouse move
					handlers.pointermove?.(data as NgtThreeEvent<PointerEvent>);
				} else {
					// All other events ...
					const handler = handlers[name as keyof NgtEventHandlers] as (event: NgtThreeEvent<PointerEvent>) => void;
					if (handler) {
						// Forward all events back to their respective handlers with the exception of click events,
						// which must use the initial target
						if (!isClickEvent || internal.initialHits.includes(eventObject)) {
							// Missed events have to come first
							pointerMissed(
								event,
								internal.interaction.filter((object) => !internal.initialHits.includes(object)),
							);
							// Now call the handler
							handler(data as NgtThreeEvent<PointerEvent>);
						}
					} else {
						// Trigger onPointerMissed on all elements that have pointer over/out handlers, but not click and weren't hit
						if (isClickEvent && internal.initialHits.includes(eventObject)) {
							pointerMissed(
								event,
								internal.interaction.filter((object) => !internal.initialHits.includes(object)),
							);
						}
					}
				}
			}

			handleIntersects(hits, event, delta, onIntersect);
		};
	}

	return { handlePointer };
}