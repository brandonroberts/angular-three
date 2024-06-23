import type { StorybookConfig } from '@storybook/angular';
import { resolve } from 'node:path';

const config: StorybookConfig = {
	stories: ['../**/*.stories.@(js|jsx|ts|tsx|mdx)'],
	addons: ['@storybook/addon-essentials', 'storybook-addon-deep-controls'],
	webpackFinal: async (config) => {
		config.module?.rules?.push({
			test: /\.(glsl|vs|fs|vert|frag)$/,
			exclude: /node_modules/,
			use: ['raw-loader', 'glslify-loader'],
			include: resolve(__dirname, '../'),
		});

		return config;
	},
	staticDirs: ['./public', './public/cube'],
	framework: {
		name: '@storybook/angular',
		options: {},
	},
};

export default config;

// To customize your webpack configuration you can use the webpackFinal field.
// Check https://storybook.js.org/docs/react/builders/webpack#extending-storybooks-webpack-config
// and https://nx.dev/recipes/storybook/custom-builder-configs
