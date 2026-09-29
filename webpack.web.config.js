/**
 * De web-jas: dezelfde Vue-app als de Nextcloud-app, gebouwd als losse
 * website voor wie geen Nextcloud heeft (2026-09-13). Alles van Nextcloud
 * (@nextcloud/vue-onderdelen, axios, router, auth) wordt hier vervangen door
 * kleine eigen varianten in src/shims/. Uitvoer: api/public/pa/app/app.js.
 */
const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')
const webpack = require('webpack')

const shims = path.resolve(__dirname, 'src/shims')

// Versie in de voettekst (kaart 123): bouwdatum.
const __webpackDefine = require('webpack').DefinePlugin
module.exports = {
	mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
	entry: path.resolve(__dirname, 'src/web.js'),
	output: {
		path: path.resolve(__dirname, '../../api/public/pa/app'),
		filename: 'app.js',
		clean: false,
	},
	devtool: 'source-map',
	resolve: {
		extensions: ['.js', '.vue'],
		alias: {
			'@nextcloud/vue/components/NcNoteCard': path.join(shims, 'NcNoteCard.vue'),
			'@nextcloud/vue/components/NcLoadingIcon': path.join(shims, 'NcLoadingIcon.vue'),
			'@nextcloud/vue/components/NcTextField': path.join(shims, 'NcTextField.vue'),
			'@nextcloud/vue/components/NcButton': path.join(shims, 'NcButton.vue'),
			'@nextcloud/vue/components/NcContent': path.join(shims, 'NcContent.vue'),
			'@nextcloud/vue/components/NcAppNavigation': path.join(shims, 'NcAppNavigation.vue'),
			'@nextcloud/vue/components/NcAppNavigationItem': path.join(shims, 'NcAppNavigationItem.vue'),
			'@nextcloud/vue/components/NcAppContent': path.join(shims, 'NcAppContent.vue'),
			'@nextcloud/axios': 'axios',
			'@nextcloud/router': path.join(shims, 'nextcloudRouter.js'),
			'@nextcloud/auth': path.join(shims, 'nextcloudAuth.js'),
			vue: 'vue/dist/vue.esm-bundler.js',
		},
	},
	module: {
		rules: [
			{ test: /\.vue$/, loader: 'vue-loader' },
			{ test: /\.js$/, exclude: /node_modules/, loader: 'babel-loader' },
			{ test: /\.css$/, use: ['style-loader', 'css-loader'] },
			{ test: /\.(svg|png)$/, type: 'asset/inline' },
		],
	},
	plugins: [
		new VueLoaderPlugin(),
		new webpack.DefinePlugin({
			__VUE_OPTIONS_API__: 'true',
			__VUE_PROD_DEVTOOLS__: 'false',
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
		}),
	],
	performance: { hints: false },
}

module.exports.plugins = (module.exports.plugins || []).concat([new __webpackDefine({ __PA_VERSIE__: JSON.stringify(new Date().toISOString().slice(0, 10)) })])
