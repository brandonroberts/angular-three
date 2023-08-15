import { NgIf } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, Input, computed, signal } from '@angular/core';
import { Triplet } from '@pmndrs/cannon-worker-api';
import { NgtArgs, NgtCanvas, NgtKey, extend } from 'angular-three';
import { NgtcPhysics } from 'angular-three-cannon';
import { NgtcDebug } from 'angular-three-cannon/debug';
import { injectBox, injectPlane } from 'angular-three-cannon/services';
import { NgtpBloom, NgtpEffectComposer } from 'angular-three-postprocessing';
import { NgtsGrid } from 'angular-three-soba/abstractions';
import { NgtsOrbitControls } from 'angular-three-soba/controls';
import { injectNgtsGLTFLoader } from 'angular-three-soba/loaders';
import { injectNgtsAnimations } from 'angular-three-soba/misc';
import * as THREE from 'three';

extend(THREE);

@Component({
	selector: 'app-plane',
	standalone: true,
	template: `
		<ngt-mesh [ref]="planeApi.ref" [receiveShadow]="true">
			<ngt-plane-geometry *args="[1000, 1000]" />
			<ngt-mesh-standard-material color="#171717" />
		</ngt-mesh>
	`,
	imports: [NgtArgs],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Plane {
	Math = Math;
	@Input() position: Triplet = [0, 0, 0];

	planeApi = injectPlane(() => ({ mass: 0, position: this.position, args: [1000, 1000] }));
}

@Component({
	selector: 'app-box',
	standalone: true,
	template: `
		<ngt-mesh [ref]="boxApi.ref" [receiveShadow]="true" [castShadow]="true">
			<ngt-box-geometry *args="[2, 2, 2]" />
			<ngt-mesh-standard-material [roughness]="0.5" color="#575757" />
		</ngt-mesh>
	`,
	imports: [NgtArgs],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Box {
	@Input() position: Triplet = [0, 0, 0];

	boxApi = injectBox(() => ({ mass: 10000, position: this.position, args: [2, 2, 2] }));
}

@Component({
	standalone: true,
	template: `
		<ngt-point-light [position]="[-10, -10, 30]" [intensity]="0.25 * Math.PI" />
		<ngt-spot-light
			[intensity]="0.3 * Math.PI"
			[position]="[30, 30, 50]"
			[angle]="0.2"
			[penumbra]="1"
			[castShadow]="true"
		/>
		<ngtc-physics [gravity]="[0, 0, -25]" [iterations]="10">
			<ngtc-debug color="white" [disabled]="true">
				<app-plane [position]="[0, 0, -10]" />
				<app-plane *ngIf="showPlane()" />
				<app-box [position]="[1, 0, 1]" />
				<app-box [position]="[2, 1, 5]" />
				<app-box [position]="[0, 0, 6]" />
				<app-box [position]="[-1, 1, 8]" />
				<app-box [position]="[-2, 2, 13]" />
				<app-box [position]="[2, -1, 13]" />
				<app-box *ngIf="!showPlane()" [position]="[0.5, 1.0, 20]" />
			</ngtc-debug>
		</ngtc-physics>
	`,
	imports: [Box, Plane, NgtcPhysics, NgIf, NgtcDebug],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CannonScene {
	Math = Math;
	showPlane = signal(true);

	ngOnInit() {
		setTimeout(() => {
			this.showPlane.set(false);
		}, 5000);
	}
}

@Component({
	standalone: true,
	template: `
		<ngt-ambient-light />
		<ngt-point-light />
		<ngt-primitive *args="[bot()]" [ref]="animations.ref" [position]="[0, -1, 0]" />
		<ngts-orbit-controls />
		<ngts-grid [position]="[0, -1, 0]" [args]="[10, 10]" />

		<ngtp-effect-composer>
			<ngtp-bloom [intensity]="1.5" />
		</ngtp-effect-composer>
	`,
	imports: [NgtArgs, NgtsOrbitControls, NgtsGrid, NgtpEffectComposer, NgtpBloom],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class Scene {
	Math = Math;

	active = signal(false);
	hover = signal(false);

	private yBotGltf = injectNgtsGLTFLoader(() => 'assets/ybot.glb');

	animations = injectNgtsAnimations(() => this.yBotGltf()?.animations || []);
	bot = computed(() => {
		const gltf = this.yBotGltf();
		if (gltf) {
			return gltf.scene;
		}
		return null;
	});
}

@Component({
	standalone: true,
	imports: [NgtCanvas, NgIf, NgtKey],
	selector: 'sandbox-root',
	template: `
		<ngt-canvas
			*key="scene"
			[sceneGraph]="scenes[scene].scene"
			[camera]="scenes[scene].cameraOptions"
			[shadows]="true"
			[gl]="scenes[scene].glOptions"
		/>
		<button (click)="onToggle()">Toggle scene: {{ scene }}</button>
	`,
	styleUrls: ['./app.component.css'],
})
export class AppComponent {
	scene: 'cannon' | 'bot' = 'cannon';
	scenes = {
		bot: {
			scene: Scene,
			cameraOptions: {},
			glOptions: {},
		},
		cannon: {
			scene: CannonScene,
			cameraOptions: { position: [0, 0, 15] },
			glOptions: { useLegacyLights: true },
		},
	} as const;

	onToggle() {
		if (this.scene === 'bot') {
			this.scene = 'cannon';
		} else {
			this.scene = 'bot';
		}
	}
}
