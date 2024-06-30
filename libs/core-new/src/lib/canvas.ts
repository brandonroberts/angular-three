import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	DestroyRef,
	ElementRef,
	EnvironmentInjector,
	Injector,
	NgZone,
	Type,
	ViewContainerRef,
	afterNextRender,
	computed,
	createEnvironmentInjector,
	inject,
	input,
	output,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { injectAutoEffect } from 'ngxtension/auto-effect';
import { mergeInputs } from 'ngxtension/inject-inputs';
import { NgxResize, ResizeOptions, ResizeResult, provideResizeOptions } from 'ngxtension/resize';
import {
	Camera,
	OrthographicCamera,
	PerspectiveCamera,
	Raycaster,
	Scene,
	Vector3,
	WebGLRenderer,
	WebGLRendererParameters,
	WebGLShadowMap,
} from 'three';
import { NgtCamera, NgtDomEvent, NgtEventManager } from './events';
import { provideRenderer } from './renderer';
import { NgtCanvasConfigurator, NgtCanvasElement, injectRootInitializer } from './roots';
import { NgtDpr, NgtPerformance, NgtRendererLike, NgtSize, NgtState, injectStore, provideStore } from './store';
import { NgtObject3DNode } from './three-types';
import { NgtProperties } from './types';
import { is } from './utils/is';
import { NgtSignalStore } from './utils/signal-store';
import { pick } from './utils/signals';
import { createPointerEvents } from './web/events';

export type NgtGLOptions =
	| NgtRendererLike
	| ((canvas: NgtCanvasElement) => NgtRendererLike)
	| Partial<NgtProperties<WebGLRenderer> | WebGLRendererParameters>
	| undefined;

export type NgtCanvasCameraOptions = (
	| NgtCamera
	| Partial<
			NgtObject3DNode<Camera, typeof Camera> &
				NgtObject3DNode<PerspectiveCamera, typeof PerspectiveCamera> &
				NgtObject3DNode<OrthographicCamera, typeof OrthographicCamera>
	  >
) & {
	/** Flags the camera as manual, putting projection into your own hands */
	manual?: boolean;
};

export interface NgtCanvasOptions {
	/** A threejs renderer instance or props that go into the default renderer */
	gl?: NgtGLOptions;
	/** Dimensions to fit the renderer to. Will measure canvas dimensions if omitted */
	size?: NgtSize;
	/**
	 * Enables shadows (by default PCFsoft). Can accept `gl.shadowMap` options for fine-tuning,
	 * but also strings: 'basic' | 'percentage' | 'soft' | 'variance'.
	 * @see https://threejs.org/docs/#api/en/renderers/WebGLRenderer.shadowMap
	 */
	shadows: boolean | 'basic' | 'percentage' | 'soft' | 'variance' | Partial<WebGLShadowMap>;
	/**
	 * Disables three r139 color management.
	 * @see https://threejs.org/docs/#manual/en/introduction/Color-management
	 */
	legacy: boolean;
	/** Switch off automatic sRGB color space and gamma correction */
	linear: boolean;
	/** Use `THREE.NoToneMapping` instead of `THREE.ACESFilmicToneMapping` */
	flat: boolean;
	/** Creates an orthographic camera */
	orthographic: boolean;
	/**
	 * R3F's render mode. Set to `demand` to only render on state change or `never` to take control.
	 * @see https://docs.pmnd.rs/react-three-fiber/advanced/scaling-performance#on-demand-rendering
	 */
	frameloop: 'always' | 'demand' | 'never';
	/**
	 * R3F performance options for adaptive performance.
	 * @see https://docs.pmnd.rs/react-three-fiber/advanced/scaling-performance#movement-regression
	 */
	performance?: Partial<Omit<NgtPerformance, 'regress'>>;
	/** Target pixel ratio. Can clamp between a range: `[min, max]` */
	dpr: NgtDpr;
	/** Props that go into the default raycaster */
	raycaster?: Partial<Raycaster>;
	/** A `THREE.Scene` instance or props that go into the default scene */
	scene?: Scene | Partial<NgtObject3DNode<Scene, typeof Scene>>;
	/** A `Camera` instance or props that go into the default camera */
	camera?: NgtCanvasCameraOptions;
	/** An R3F event manager to manage elements' pointer events */
	events: (store: NgtSignalStore<NgtState>) => NgtEventManager<HTMLElement>;
	/** The target where events are being subscribed to, default: the div that wraps canvas */
	eventSource?: HTMLElement | ElementRef<HTMLElement>;
	/** The event prefix that is cast into canvas pointer x/y events, default: "offset" */
	eventPrefix: 'offset' | 'client' | 'page' | 'layer' | 'screen';
	/** Default coordinate for the camera to look at */
	lookAt?: Vector3 | Parameters<Vector3['set']>;
}

const defaultOptions: NgtCanvasOptions = {
	shadows: false,
	legacy: false,
	linear: false,
	flat: false,
	orthographic: false,
	frameloop: 'always',
	dpr: [1, 2],
	eventPrefix: 'offset',
	events: createPointerEvents,
};

@Component({
	selector: 'ngt-canvas',
	standalone: true,
	template: `
		<div (ngxResize)="resizeResult.set($event)" style="height: 100%; width: 100%;">
			<canvas #glCanvas style="display: block;"></canvas>
		</div>
	`,
	imports: [NgxResize],
	changeDetection: ChangeDetectionStrategy.OnPush,
	providers: [
		provideResizeOptions({ emitInZone: false, emitInitialResult: true, debounce: 250 } as ResizeOptions),
		provideStore(),
	],
	host: {
		style: 'display: block;position: relative;width: 100%;height: 100%;overflow: hidden;',
		'[style.pointerEvents]': 'hbPointerEvents()',
	},
})
export class NgtCanvas {
	private store = injectStore();
	private initRoot = injectRootInitializer();
	private autoEffect = injectAutoEffect();
	private zone = inject(NgZone);
	private host = inject<ElementRef<HTMLElement>>(ElementRef);
	private injector = inject(Injector);
	private environmentInjector = inject(EnvironmentInjector);

	/**
	 * The scene graph to render
	 * - Can be an arbitrary Component
	 * - Can be the RouterOutlet for routed scene
	 */
	sceneGraph = input.required<Type<any>>();
	options = input(defaultOptions, { transform: mergeInputs(defaultOptions) });

	created = output<NgtState>();
	pointerMissed = outputFromObservable(this.store.get('pointerMissed$'));

	private glCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('glCanvas');
	private glCanvasViewContainerRef = viewChild.required('glCanvas', { read: ViewContainerRef });

	private eventSource = pick(this.options, 'eventSource');
	private eventPrefix = pick(this.options, 'eventPrefix');

	// NOTE: this signal is updated outside of Zone
	protected resizeResult = signal<ResizeResult>({} as ResizeResult, { equal: Object.is });
	protected hbPointerEvents = computed(() => (this.eventSource() ? 'none' : 'auto'));

	private configurator?: NgtCanvasConfigurator;
	private glEnvironmentInjector?: EnvironmentInjector;
	private glRef?: ComponentRef<unknown>;

	constructor() {
		afterNextRender(() => {
			this.zone.runOutsideAngular(() => {
				this.configurator = this.initRoot(this.glCanvas().nativeElement);
				this.noZoneResizeEffect();
			});
		});

		inject(DestroyRef).onDestroy(() => {
			this.glRef?.destroy();
			this.glEnvironmentInjector?.destroy();
			this.configurator?.destroy();
		});
	}

	private noZoneResizeEffect() {
		this.autoEffect(() => {
			const resizeResult = this.resizeResult();
			if (resizeResult.width > 0 && resizeResult.height > 0) {
				if (!this.configurator) this.configurator = this.initRoot(this.glCanvas().nativeElement);
				this.configurator.configure(this.options());

				untracked(() => {
					if (this.glRef) {
						this.glRef.changeDetectorRef.detectChanges();
					} else {
						this.noZoneRender();
					}
				});
			}
		});
	}

	private noZoneRender() {
		// NOTE: destroy previous instances if existed
		this.glEnvironmentInjector?.destroy();
		this.glRef?.destroy();

		// NOTE: Flag the canvas active, rendering will now begin
		this.store.update((state) => ({ internal: { ...state.internal, active: true } }));

		let state = this.store.snapshot;
		const [eventSource, eventPrefix] = [untracked(this.eventSource), untracked(this.eventPrefix)];

		// connect to event source
		state.events.connect?.(
			eventSource ? (is.ref(eventSource) ? eventSource.nativeElement : eventSource) : this.host.nativeElement,
		);

		// setup compute for eventPrefix
		if (eventPrefix) {
			state.setEvents({
				compute: (event, store) => {
					const { pointer, raycaster, camera, size } = store.snapshot;
					const x = event[(eventPrefix + 'X') as keyof NgtDomEvent] as number;
					const y = event[(eventPrefix + 'Y') as keyof NgtDomEvent] as number;
					pointer.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
					raycaster.setFromCamera(pointer, camera);
				},
			});
		}

		// emit created event
		this.created.emit(this.store.snapshot);
		state = this.store.snapshot;

		if (!state.events.connected) {
			state.events.connect?.(untracked(this.glCanvas).nativeElement);
		}

		untracked(() => {
			this.glEnvironmentInjector = createEnvironmentInjector([provideRenderer(this.store)], this.environmentInjector);
			this.glRef = this.glCanvasViewContainerRef().createComponent(this.sceneGraph(), {
				environmentInjector: this.glEnvironmentInjector,
				injector: this.injector,
			});

			// NOTE: start renderering after attaching the scene graph
			if (this.store.snapshot.internal.frames === 0) {
				this.store.snapshot.invalidate();
			}
			this.glRef.changeDetectorRef.detectChanges();
		});
	}
}