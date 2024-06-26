import { CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Triplet } from '@pmndrs/cannon-worker-api';
import { NgtArgs, extend, injectBeforeRender } from 'angular-three';
import { NgtcPhysics, NgtcPhysicsContent } from 'angular-three-cannon';
import { injectBox, injectPlane, injectSphere } from 'angular-three-cannon/body';
import { NgtcDebug } from 'angular-three-cannon/debug';
import * as THREE from 'three';
import { Color } from 'three';
import niceColors from '../colors';

extend(THREE);

@Component({
	selector: 'app-plane',
	standalone: true,
	template: `
		<ngt-mesh [ref]="plane.ref" [receiveShadow]="true">
			<ngt-plane-geometry *args="[1000, 1000]" />
			<ngt-mesh-phong-material [color]="color()" />
		</ngt-mesh>
	`,
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgtArgs],
})
export class Plane {
	color = input.required<string>();
	position = input<Triplet>([0, 0, 0]);
	rotation = input<Triplet>([0, 0, 0]);

	plane = injectPlane(() => ({
		position: this.position(),
		rotation: this.rotation(),
	}));
}

@Component({
	selector: 'app-box',
	standalone: true,
	template: `
		<ngt-mesh [ref]="box.ref" [castShadow]="true" [receiveShadow]="true">
			<ngt-box-geometry *args="args" />
			<ngt-mesh-lambert-material color="white" />
		</ngt-mesh>
	`,
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgtArgs],
})
export class Box {
	args: Triplet = [4, 4, 4];
	box = injectBox(() => ({ args: this.args, mass: 1, type: 'Kinematic' }));

	constructor() {
		injectBeforeRender(({ clock }) => {
			const t = clock.getElapsedTime();
			this.box.api.position.set(Math.sin(t * 2) * 5, Math.cos(t * 2) * 5, 3);
			this.box.api.rotation.set(Math.sin(t * 6), Math.cos(t * 6), 0);
		});
	}
}

@Component({
	selector: 'app-instanced-spheres',
	standalone: true,
	template: `
		<ngt-instanced-mesh
			[ref]="sphere.ref"
			[castShadow]="true"
			[receiveShadow]="true"
			*args="[undefined, undefined, count()]"
		>
			<ngt-sphere-geometry *args="[1, 16, 16]">
				<ngt-instanced-buffer-attribute attach="attributes.color" *args="[colors(), 3]" />
			</ngt-sphere-geometry>
			<ngt-mesh-phong-material [vertexColors]="true" />
		</ngt-instanced-mesh>
	`,
	imports: [NgtArgs],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstancedSpheres {
	count = input(100);

	sphere = injectSphere((index) => ({
		args: [1],
		mass: 1,
		position: [Math.random() - 0.5, Math.random() - 0.5, index * 2],
	}));

	colors = computed(() => {
		const array = new Float32Array(this.count() * 3);
		const color = new Color();
		for (let i = 0; i < this.count(); i++) {
			color
				.convertSRGBToLinear()
				.set(niceColors[Math.floor(Math.random() * 5)])
				.toArray(array, i * 3);
		}
		return array;
	});
}

@Component({
	standalone: true,
	template: `
		<ngt-hemisphere-light [intensity]="0.35 * Math.PI" />
		<ngt-spot-light
			[angle]="0.3"
			[castShadow]="true"
			[decay]="0"
			[intensity]="2 * Math.PI"
			[penumbra]="1"
			[position]="[30, 0, 30]"
		>
			<ngt-vector2 *args="[256, 256]" attach="shadow.mapSize" />
		</ngt-spot-light>
		<ngt-point-light [decay]="0" [intensity]="0.5 * Math.PI" [position]="[-30, 0, -30]" />
		<ngtc-physics [options]="{ gravity: [0, 0, -30] }">
			<ng-template physicsContent>
				<app-plane [color]="niceColors[4]" />
				<app-plane [color]="niceColors[1]" [position]="[-6, 0, 0]" [rotation]="[0, 0.9, 0]" />
				<app-plane [color]="niceColors[2]" [position]="[6, 0, 0]" [rotation]="[0, -0.9, 0]" />
				<app-plane [color]="niceColors[3]" [position]="[0, 6, 0]" [rotation]="[0.9, 0, 0]" />
				<app-plane [color]="niceColors[0]" [position]="[0, -6, 0]" [rotation]="[-0.9, 0, 0]" />
				<app-box />
				<app-instanced-spheres />
			</ng-template>
		</ngtc-physics>
	`,
	imports: [InstancedSpheres, Box, Plane, NgtcPhysics, NgtcPhysicsContent, NgtArgs, NgtcDebug],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'kimenatic-experience' },
})
export class Experience {
	Math = Math;
	niceColors = niceColors;
}