import { MathUtils, OrthographicCamera, PerspectiveCamera, WebGLRenderer } from 'three';
import { NgtGLOptions } from '../canvas';
import { NgtIntersection } from '../events';
import { NgtCanvasElement } from '../roots';
import { NgtDpr, NgtSize } from '../store';
import { is } from './is';

const idCache: { [id: string]: boolean | undefined } = {};
export function makeId(event?: NgtIntersection): string {
	if (event) {
		return (event.eventObject || event.object).uuid + '/' + event.index + event.instanceId;
	}

	const newId = MathUtils.generateUUID();
	// ensure not already used
	if (!idCache[newId]) {
		idCache[newId] = true;
		return newId;
	}
	return makeId();
}

export function makeDpr(dpr: NgtDpr, window?: Window) {
	// Err on the side of progress by assuming 2x dpr if we can't detect it
	// This will happen in workers where window is defined but dpr isn't.
	const target = typeof window !== 'undefined' ? window.devicePixelRatio ?? 2 : 1;
	return Array.isArray(dpr) ? Math.min(Math.max(dpr[0], target), dpr[1]) : dpr;
}

export function makeRendererInstance<TCanvas extends NgtCanvasElement>(
	glOptions: NgtGLOptions,
	canvas: TCanvas,
): WebGLRenderer {
	const customRenderer = (typeof glOptions === 'function' ? glOptions(canvas) : glOptions) as WebGLRenderer;
	if (is.renderer(customRenderer)) return customRenderer;
	return new WebGLRenderer({
		powerPreference: 'high-performance',
		canvas: canvas,
		antialias: true,
		alpha: true,
		...glOptions,
	});
}

export function makeCameraInstance(isOrthographic: boolean, size: NgtSize) {
	if (isOrthographic) return new OrthographicCamera(0, 0, 0, 0, 0.1, 1000);
	return new PerspectiveCamera(75, size.width / size.height, 0.1, 1000);
}