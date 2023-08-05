import type { Injector, Signal } from '@angular/core';
import { injectNgtLoader, type NgtLoaderResults, type NgtObjectMap } from 'angular-three';
import { DRACOLoader, GLTF, GLTFLoader, MeshoptDecoder } from 'three-stdlib';

let dracoLoader: DRACOLoader | null = null;

function _extensions(useDraco: boolean | string, useMeshOpt: boolean, extensions?: (loader: GLTFLoader) => void) {
	return (loader: THREE.Loader) => {
		if (extensions) {
			extensions(loader as GLTFLoader);
		}

		if (useDraco) {
			if (!dracoLoader) {
				dracoLoader = new DRACOLoader();
			}

			dracoLoader.setDecoderPath(
				typeof useDraco === 'string' ? useDraco : 'https://www.gstatic.com/draco/versioned/decoders/1.4.3/',
			);
			(loader as GLTFLoader).setDRACOLoader(dracoLoader);
		}

		if (useMeshOpt) {
			(loader as GLTFLoader).setMeshoptDecoder(
				typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder,
			);
		}
	};
}

export type NgtsGLTF<T extends Partial<NgtObjectMap>> = GLTF & NgtObjectMap & T;

export function injectNgtsGLTFLoader<TUrl extends string | string[] | Record<string, string>>(
	path: () => TUrl,
	{
		useDraco = true,
		useMeshOpt = true,
		injector,
		extensions,
	}: {
		useDraco?: boolean | string;
		useMeshOpt?: boolean;
		injector?: Injector;
		extensions?: (loader: GLTFLoader) => void;
	} = {},
): Signal<NgtLoaderResults<TUrl, GLTF & NgtObjectMap> | null> {
	return injectNgtLoader(() => GLTFLoader, path, {
		extensions: _extensions(useDraco, useMeshOpt, extensions),
		injector,
	});
}

injectNgtsGLTFLoader['preload'] = <TUrl extends string | string[] | Record<string, string>>(
	path: () => TUrl,
	{
		useDraco = true,
		useMeshOpt = true,
		extensions,
	}: {
		useDraco?: boolean | string;
		useMeshOpt?: boolean;
		extensions?: (loader: GLTFLoader) => void;
	} = {},
) => {
	(injectNgtLoader as any)['preload'](() => GLTFLoader, path, _extensions(useDraco, useMeshOpt, extensions));
};