const webpackConfig = require('@nextcloud/webpack-vue-config')

// The base config's default filename pattern ("<app>-[name].js?v=[contenthash]")
// writes a literal "?" into the output filename on disk — invalid on
// Windows/NTFS (this app is built on Windows, deployed to the Pi). Nextcloud's
// own Util::addScript() already appends its own cache-busting query param
// server-side when it renders the <script> tag, so a plain filename here is
// both necessary and sufficient.
const appName = process.env.npm_package_name
webpackConfig.output.filename = `${appName}-[name].js`
webpackConfig.output.chunkFilename = `${appName}-[name].js`

// Versie van de web-agenda in de voettekst (kaart 123): datum van de bouw.
const webpack = require('webpack')
webpackConfig.plugins.push(new webpack.DefinePlugin({ __PA_VERSIE__: JSON.stringify(new Date().toISOString().slice(0, 10)) }))

module.exports = webpackConfig
