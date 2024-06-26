import {
	CUSTOM_ELEMENTS_SCHEMA,
	ChangeDetectionStrategy,
	Component,
	Signal,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { Triplet } from '@pmndrs/cannon-worker-api';
import { NgtArgs, extend } from 'angular-three';
import { NgtcPhysics, NgtcPhysicsContent } from 'angular-three-cannon';
import { injectConvexPolyhedron } from 'angular-three-cannon/body';
import { NgtcDebug } from 'angular-three-cannon/debug';
import { injectGLTFLoader } from 'angular-three-soba/loaders';
import * as THREE from 'three';
import { BoxGeometry, BufferGeometry, ConeGeometry, Mesh } from 'three';
import { GLTF, Geometry } from 'three-stdlib';
import { UiPlane } from '../ui/plane';
import { PositionRotationInput } from '../ui/position-rotation-input';

extend(THREE);

function toConvexProps(bufferGeometry: BufferGeometry): [vertices: Triplet[], faces: Triplet[]] {
	const geo = new Geometry().fromBufferGeometry(bufferGeometry);
	geo.mergeVertices();
	const vertices: Triplet[] = geo.vertices.map((v) => [v.x, v.y, v.z]);
	const faces: Triplet[] = geo.faces.map((f) => [f.a, f.b, f.c]);
	return [vertices, faces];
}

// A cone is a convex shape by definition...
@Component({
	selector: 'app-cone',
	standalone: true,
	template: `
		<ngt-mesh
			[castShadow]="true"
			[geometry]="geometry()"
			[ref]="convex.ref"
			[rotation]="positionRotationInputs.rotation()"
			[position]="positionRotationInputs.position()"
		>
			<ngt-mesh-normal-material />
		</ngt-mesh>
	`,
	hostDirectives: [{ directive: PositionRotationInput, inputs: ['position', 'rotation'] }],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cone {
	positionRotationInputs = inject(PositionRotationInput, { host: true });
	sides = input.required<number>();
	geometry = computed(() => new ConeGeometry(0.7, 0.7, this.sides(), 1));
	args = computed(() => toConvexProps(this.geometry()));
	convex = injectConvexPolyhedron(() => ({
		args: this.args(),
		mass: 100,
		position: this.positionRotationInputs.position(),
		rotation: this.positionRotationInputs.rotation(),
	}));
}

// ...And so is a cube!
@Component({
	selector: 'app-cube',
	standalone: true,
	template: `
		<ngt-mesh
			[receiveShadow]="true"
			[castShadow]="true"
			[geometry]="geometry()"
			[ref]="convex.ref"
			[rotation]="positionRotationInputs.rotation()"
			[position]="positionRotationInputs.position()"
		>
			<ngt-mesh-normal-material />
		</ngt-mesh>
	`,
	hostDirectives: [{ directive: PositionRotationInput, inputs: ['position', 'rotation'] }],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cube {
	positionRotationInputs = inject(PositionRotationInput, { host: true });
	size = input.required<number>();
	// NOTE: this is wildly inefficient vs useBox
	geometry = computed(() => new BoxGeometry(this.size(), this.size(), this.size()));
	args = computed(() => toConvexProps(this.geometry()));
	convex = injectConvexPolyhedron(() => ({
		args: this.args(),
		mass: 100,
		position: this.positionRotationInputs.position(),
		rotation: this.positionRotationInputs.rotation(),
	}));
}

type DiamondGLTF = GLTF & {
	materials: {};
	nodes: { Cylinder: Mesh };
};

@Component({
	selector: 'app-diamond',
	standalone: true,
	template: `
		@if (geometry(); as geometry) {
			<ngt-mesh
				[castShadow]="true"
				[receiveShadow]="true"
				[geometry]="geometry"
				[ref]="convex.ref"
				[rotation]="positionRotationInputs.rotation()"
			>
				<ngt-mesh-standard-material [wireframe]="true" color="white" />
			</ngt-mesh>
		}
	`,
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	hostDirectives: [{ directive: PositionRotationInput, inputs: ['position', 'rotation'] }],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Diamond {
	positionRotationInputs = inject(PositionRotationInput, { host: true });

	gltf = injectGLTFLoader(() => './diamond.glb') as Signal<DiamondGLTF | null>;
	geometry = computed(() => {
		const gltf = this.gltf();
		if (!gltf) return null;
		return gltf.nodes.Cylinder.geometry;
	});
	args = computed(() => {
		const geometry = this.geometry();
		if (!geometry) return undefined;
		return toConvexProps(geometry);
	});
	convex = injectConvexPolyhedron(() => ({
		args: this.args(),
		mass: 100,
		position: this.positionRotationInputs.position(),
		rotation: this.positionRotationInputs.rotation(),
	}));
}

@Component({
	standalone: true,
	template: `
		<ngt-color *args="['lightpink']" attach="background" />
		<ngt-spot-light
			[angle]="0.3"
			[castShadow]="true"
			[decay]="0"
			[intensity]="2 * Math.PI"
			[penumbra]="1"
			[position]="[15, 15, 15]"
		>
			<ngt-vector2 *args="[2048, 2048]" attach="shadow.mapSize" />
		</ngt-spot-light>

		<ngtc-physics [options]="{ gravity: gravity() }" [debug]="{ enabled: false, scale: 1.1 }">
			<ng-template physicsContent>
				<ngt-group (pointerdown)="toggleInvertGravity()">
					<app-ui-plane [rotation]="[-Math.PI / 2, 0, 0]" />
					<app-diamond [position]="[1, 5, 0]" [rotation]="[0.4, 0.1, 0.1]" />
					<app-cone [position]="[-1, 5, 0.5]" [rotation]="[0.1, 0.2, 0.1]" [sides]="6" />
					<app-cone [position]="[-1, 6, 0]" [rotation]="[0.5, 0.1, 0.1]" [sides]="8" />
					<app-cube [position]="[2, 3, -0.3]" [rotation]="[0.5, 0.4, -1]" [size]="0.4" />
					<app-cone [position]="[-0.3, 7, 1]" [rotation]="[1, 0.4, 0.1]" [sides]="7" />
				</ngt-group>
			</ng-template>
		</ngtc-physics>
	`,
	imports: [NgtArgs, NgtcPhysics, NgtcPhysicsContent, NgtcDebug, UiPlane, Diamond, Cone, Cube],
	schemas: [CUSTOM_ELEMENTS_SCHEMA],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { class: 'convex-experience' },
})
export class Experience {
	Math = Math;
	invertGravity = signal(false);
	gravity = computed<Triplet>(() => [0, this.invertGravity() ? 5 : -10, 0]);

	toggleInvertGravity() {
		this.invertGravity.update((prev) => !prev);
	}
}