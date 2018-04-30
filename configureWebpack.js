'use strict';

const _ = require('lodash'),
    path = require('path'),
    fs = require('fs'),
    chalk = require('chalk'),
    webpack = require('webpack'),
    autoprefixer = require('autoprefixer'),
    BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin,
    CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin'),
    CleanWebpackPlugin = require('clean-webpack-plugin'),
    ExtractTextPlugin = require('extract-text-webpack-plugin'),
    FaviconsWebpackPlugin = require('favicons-webpack-plugin'),
    HtmlWebpackPlugin = require('html-webpack-plugin'),
    UglifyJsPlugin = require('uglifyjs-webpack-plugin'),
    basePath = fs.realpathSync(process.cwd());

/**
 * Consolidated Webpack configuration for both dev-time and production builds of Hoist React web applications.
 *
 * Sample commands to run configurations produced by this method include:
 *      `webpack --env.prodBuild --env.appVersion=1.2.3` to trigger a build at version 1.2.3
 *      `webpack-dev-server --env.inlineHoist` to run webpack dev server w/hoist-react in inline mode
 *
 * @param {Object} env - config passed in from app webpack config or the CLI via --env flags.
 * @param {string} env.appCode - short, internal code for the application - baked into client as
 *      XH.appCode. Should be lowercase, dash-separated, and should match the Gradle project name
 *      (e.g. portfolio-manager).
 * @param {string} [env.appName] - user-facing display name for the application - baked into client
 *      as XH.appName. Should be title cased and space-separated. If null, will be defaulted based
 *      on appCode (e.g. portfolio-manager -> Portfolio Manager).
 * @param {boolean} [env.prodBuild=false] - true to indicate this is a build (as opposed to run of
 *      webpack-dev-server)
 * @param {boolean} [env.inlineHoist=false] - true to use a locally checked-out copy of hoist-react
 *      when running the dev server, as opposed to using the downloaded dependency. This allows
 *      hoist-react developers to test plugin changes. Has no effect (always false) for builds.
 * @param {boolean} [env.analyzeBundles=false] - true to launch an interactive bundle analyzer to
 *      review output bundles, contents, and sizes.
 * @param {string} [env.appVersion] - client version - baked into client as XH.appVersion
 * @param {string} [env.appBuild] - build/git tag - baked into client as XH.appBuild
 * @param {string} [env.baseUrl] - root path prepended to all relative URLs called via FetchService
 *      (the core Hoist service for making Ajax requests). Defaults to `/api/` in production mode to
 *      work with proxy-based deployments and to `localhost:8080` in dev mode to point to a local
 *      Grails server - these typically should not need to be changed at the app level.
 * @param {string} env.agGridLicenseKey - client-supplied key for ag-Grid enterprise license.
 * @param {string} [env.favicon] - relative path to a favicon source image to be processed.
 * @param {string} [env.devServerOpenPage] - path to auto-open when webpack-dev-server starts.
 *      Leave null to disable automatic page open on startup.
 */
function configureWebpack(env) {
    if (!env.appCode) throw 'Missing required "appCode" config - cannot proceed';

    const appCode = env.appCode,
        appName = env.appName || _.startCase(appCode),
        prodBuild = env.prodBuild === true,
        inlineHoist = !prodBuild && env.inlineHoist === true,
        analyzeBundles = env.analyzeBundles === true,
        appVersion = env.appVersion || '0.0.0',
        appBuild = env.appBuild || 'UNKNOWN',
        baseUrl = env.baseUrl || (prodBuild ? '/api/' : 'http://localhost:8080/'),
        favicon = env.favicon || null,
        devServerPort = env.devServerPort || 3000;

    process.env.BABEL_ENV = prodBuild ? 'production' : 'development';
    process.env.NODE_ENV = prodBuild ? 'production' : 'development';

    console.log('/-----------------------------------------------/');
    console.log(`  Configuring ${appName} v${appVersion}`);
    console.log('/-----------------------------------------------/');
    console.log(`  🚀  Production build: ${printBool(prodBuild)}`);
    console.log(`  🏗️  Inline Hoist: ${printBool(inlineHoist)}`);
    if (analyzeBundles) console.log('🎁  Bundle analysis enabled - will launch after webpack completes.');
    console.log('/-----------------------------------------------/');

    const srcPath = path.resolve(basePath, 'src'),
        outPath = path.resolve(basePath, 'build'),
        publicPath = '/';  // Path on which fully built app is served - i.e. root context

    // Resolve Hoist as either a sibling (inline, checked-out) project or a downloaded package dependency
    const hoistPath = inlineHoist ?
        path.resolve(basePath, '../../hoist-react') :
        path.resolve(basePath, 'node_modules/@xh/hoist');

    // When running inline, resolve inline Hoist's own node_modules package so we can tell Babel to exclude
    const hoistNodeModulesPath = inlineHoist ?
        path.resolve(hoistPath, 'node_modules') :
        null;

    // Resolve app entry points - one for each file within src/apps/ - to create bundle entries below.
    const appDirPath = path.resolve(srcPath, 'apps'),
        apps = fs
            .readdirSync(appDirPath)
            .filter(f => f.endsWith('.js'))
            .map(f => {
                return {
                    name: f.replace('.js', ''),
                    path: path.resolve(appDirPath, f)
                };
            });

    return {

        // One named entry chunk per app, as above.
        entry: {
            ..._.chain(apps)
                .keyBy('name')
                .mapValues(app => [app.path])
                .value()
        },

        output: {
            // Output built assets in directories per entry point / chunk.
            // Use chunkhash in prod to get distinct hashes for app vs. common chunks (throws error in dev - investigate)
            filename: prodBuild ? '[name]/[name].[chunkhash:8].js' : '[name]/[name].[hash:8].js',
            path: outPath,
            publicPath: publicPath,
            pathinfo: !prodBuild,
            // From CRA - related to file paths for sourcemaps, esp. on Windows - review if necessary / helpful
            devtoolModuleFilenameTemplate: info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')
        },

        // Tell webpack where to look for modules when resolving imports - this is the key to getting
        // inlineHoist mode to look in within the checked-out hoist-react project at hoistPath.
        // In bundled (non inline) mode, this allows `import {Foo} from hoist` vs `import {Foo} from @xh/hoist`
        resolve: {
            alias: {
                hoist: inlineHoist ? hoistPath : '@xh/hoist'
            }
        },

        module: {
            // Flag missing exports as a failure vs. warning
            strictExportPresence: true,

            rules: [
                // Production builds run eslint before anything.
                // Currently only for builds to avoid dev-time friction with small in-flight changes breaking build.
                prodBuild ? {
                    test: /\.(js)$/,
                    enforce: 'pre',
                    use: [
                        {
                            loader: 'eslint-loader',
                            options: {
                                eslintPath: require.resolve('eslint')
                            }
                        }
                    ],
                    // If we do run during dev-time (in future, maybe with flag?), lint Hoist when running inline.
                    // Note that we'll need to rely on the Teamcity build to ensure Hoist gets linted.
                    include: inlineHoist ? [hoistPath, srcPath] : srcPath,
                    exclude: inlineHoist ? [hoistNodeModulesPath] : undefined
                } : undefined,

                // Core loaders for all assets
                {
                    oneOf: [

                        // Encode small-enough images into inline data URLs
                        {
                            test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
                            loader: 'url-loader',
                            options: {
                                limit: 10000,
                                name: 'static/media/[name].[hash:8].[ext]'
                            }
                        },

                        // Transpile JS via Babel
                        {
                            test: /\.(js)$/,
                            use: {
                                loader: 'babel-loader',
                                options: {
                                    presets: ['react-app'],
                                    plugins: ['transform-decorators-legacy'],
                                    compact: true,
                                    cacheDirectory: !prodBuild
                                }
                            },

                            // Always transpile Hoist - even when "packaged" we have the raw source as we are not
                            // currently transpiling anything in hoist-react on its own.
                            include: [srcPath, hoistPath],
                            // In inline mode also *avoid* transpiling inline hoist's own node_modules libraries.
                            exclude: inlineHoist ? [hoistNodeModulesPath] : undefined
                        },

                        // Process CSS and SASS - distinct workflows for prod build vs. dev-time
                        prodBuild ? cssConfProd() : cssConfDev(),
                        prodBuild ? sassConfProd() : sassConfDev(),

                        // Fall-through entry to process all other assets via a file-loader.
                        // Exclude config here is from CRA source config (commented there, but didn't understand).
                        {
                            exclude: [/\.js$/, /\.html$/, /\.json$/],
                            loader: 'file-loader',
                            options: {
                                name: 'static/media/[name].[hash:8].[ext]'
                            }
                        }
                    ]
                }
            ].filter(Boolean)
        },

        plugins: [
            // Clean (remove) the output directory before each run.
            new CleanWebpackPlugin([outPath], {verbose: false}),

            // Inject global constants at compile time.
            new webpack.DefinePlugin({
                'process.env': {NODE_ENV: JSON.stringify(process.env.NODE_ENV)},
                xhAppCode: JSON.stringify(appCode),
                xhAppName: JSON.stringify(appName),
                xhAppVersion: JSON.stringify(appVersion),
                xhAppBuild: JSON.stringify(appBuild),
                xhBaseUrl: JSON.stringify(baseUrl),
                xhAgGridLicenseKey: JSON.stringify(env.agGridLicenseKey)
            }),

            // Extract common (i.e. library, vendor) code into a dedicated chunk for re-use across app updates
            // and multiple entry points. This is the simplest configuration of this plugin - an alternative would
            // be for us to define explicit vendor dependencies within an entry point to break out as common.
            // By default, if a module is called by >=2 entry points, it gets bundled into common.
            // We should evaluate once we have a more fully built set of example apps!
            new webpack.optimize.CommonsChunkPlugin({
                name: ['common']
            }),

            // This second invocation of the plugin extracts the webpack runtime into its own chunk to avoid
            // changes to our app-level code and modules modifying the common chunk hash as well and preventing caching.
            // See https://medium.com/webpack/predictable-long-term-caching-with-webpack-d3eee1d3fa31
            new webpack.optimize.CommonsChunkPlugin({
                name: ['runtime']
            }),

            // More plugins to avoid unwanted hash changes and support better caching - uses paths to identify
            // modules vs. numeric IDs, helping to keep generated chunks (specifically their hashes) stable.
            // Also required for HMR to work.
            new webpack.NamedChunksPlugin(),
            new webpack.NamedModulesPlugin(),

            // Avoid bundling all moment.js locales and blowing up the bundle size
            // See https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
            new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),

            // Generate favicons from a single source image if provided - injected into HTML generated below
            favicon ? new FaviconsWebpackPlugin({
                logo: favicon,
                prefix: 'icons-[hash:8]/',
                icons: {
                    android: true,
                    appleIcon: true,
                    favicons: true,
                    appleStartup: false,
                    coast: false,
                    firefox: false,
                    opengraph: false,
                    twitter: false,
                    yandex: false,
                    windows: false
                }
            }) : undefined,

            // Generate HTML index pages - one per app.
            ...apps.map(app => {
                return new HtmlWebpackPlugin({
                    inject: true,
                    title: appName,
                    template: 'public/index.html',
                    filename: `${app.name}/index.html`,
                    // Ensure common chunks are included!
                    chunks: [app.name, 'common', 'runtime']
                });
            }),

            // Support an optional post-build/run interactive treemap of output bundles and their sizes / contents.
            analyzeBundles ? new BundleAnalyzerPlugin({
                analyzerMode: 'server'
            }) : undefined,

            // Who wants errors? Not us.
            new webpack.NoEmitOnErrorsPlugin(),

            // Environment-specific plugins
            ...(prodBuild ? extraPluginsProd() : extraPluginsDev())

        ].filter(Boolean),

        devtool: prodBuild ? 'source-map' : 'eval-source-map',

        // Inline dev-time configuration for webpack-dev-server.
        devServer: prodBuild ? undefined : {
            host: 'localhost',
            port: devServerPort,
            overlay: true,
            compress: true,
            hot: true,
            open: env.devServerOpenPage != null,
            openPage: env.devServerOpenPage,
            // Support HTML5 history routes for apps, with /appName/ as the base route for each
            historyApiFallback: {
                rewrites: apps.map(app => {
                    return {
                        from: new RegExp(`^/${app.name}`),
                        to: `/${app.name}/index.html`
                    };
                })
            }
        }
    };
}


//------------------------
// Implementation
//------------------------

// Production builds use ExtractTextPlugin to break built styles into dedicated CSS output files (vs. tags injected
// into DOM) for production builds. Note relies on ExtractTextPlugin being called within the prod plugins section.
const cssConfProd = () => {
    return {
        test: /\.css$/,
        loader: ExtractTextPlugin.extract(
            {
                fallback: {
                    // For CSS that does not end up extracted into a dedicated file - inject inline.
                    loader: 'style-loader',
                    options: {hmr: false}
                },
                use: [
                    cssLoader(1),
                    postCssLoader()
                ]
            }
        )
    };
};

const sassConfProd = () => {
    return {
        test: /\.scss$/,
        loader: ExtractTextPlugin.extract(
            {
                fallback: {
                    loader: 'style-loader',
                    options: {hmr: false}
                },
                use: [
                    cssLoader(2),
                    postCssLoader(),
                    sassLoader()
                ]
            }
        )
    };
};

// Dev-time CSS/SASS configs do not extract CSS into dedicated files - keeping it inline via default style-loader.
// This is a common dev setup, and is compatible with HMR.
const cssConfDev = () => {
    return {
        test: /\.css$/,
        use: [
            'style-loader',
            cssLoader(1),
            postCssLoader()
        ]
    };
};

const sassConfDev = () => {
    return {
        test: /\.scss$/,
        use: [
            'style-loader',
            cssLoader(2),
            postCssLoader(),
            sassLoader()
        ]
    };
};

// CSS loader resolves @imports within CSS, similar to module support in JS.
const cssLoader = (importLoaders) => {
    return {
        loader: 'css-loader',
        options: {
            // Indicate how many prior loaders (postCssLoader/sassLoader) to also run on @imported resources.
            importLoaders: importLoaders,
            // Generate CSS sourcemaps
            sourceMap: true
        }
    };
};


// Pre-process CSS to install flexbox bug workarounds + vendor-specific prefixes for the configured browsers
// Note that the "post" in the loader name refers to http://postcss.org/ - NOT the processing order within Webpack.
// (In fact this is the first loader that gets our CSS, as loaders run R-L or bottom-to-top.
// Inclusion of postcss-flexbugs-fixes is from CRA.
const postCssLoader = () => {
    return {
        loader: 'postcss-loader',
        options: {
            ident: 'postcss',
            plugins: () => [
                require('postcss-flexbugs-fixes'),
                autoprefixer({
                    // TODO - Can continue to tune via http://browserl.ist/
                    browsers: [
                        '>1%',
                        'last 2 versions',
                        'not ie < 11',
                        'not opera > 0',
                        'not op_mob > 0',
                        'not op_mini all'
                    ],
                    flexbox: 'no-2009'
                })
            ]
        }
    };
};

const sassLoader =  () => {
    return {
        loader: 'sass-loader'
    };
};

const extraPluginsProd = () => {
    return [
        // Extract built CSS files into sub-directories by chunk / entry point name.
        new ExtractTextPlugin({
            filename: '[name]/[name].[contenthash:8].css',
            // Required by CommonsChunkPlugin to ensure we extract CSS from common chunk as well as app entry points.
            allChunks: true
        }),

        // Enable JS minification and tree-shaking.
        new UglifyJsPlugin({
            sourceMap: true,
            parallel: true,
            uglifyOptions: {
                // Options here sourced from CRA config
                compress: {comparisons: false},
                mangle: {safari10: true, keep_fnames:true},
                output: {comments: false}
            }
        })
    ];
};

const extraPluginsDev = () => {
    return [
        // Avoid dev-time errors with mis-matched casing in imports (where a less case sensitive OS
        // will resolve OK, but import could fail at build time with strict case sensitivity).
        new CaseSensitivePathsPlugin(),

        // For HMR
        new webpack.HotModuleReplacementPlugin()
    ];
};

const printBool = v => {
    const oks = ['true', 'yes', 'yep', 'sure', 'ok', 'you bet', 'happy to', 'please', 'for sure', '+1', 'oui', 'agreed', 'certainly', 'aye', 'affirmative'],
        nos = ['false', 'no', 'nope', 'nah', 'never', 'no way', 'uh-uh', 'not today', 'pass', 'nyet', 'meh', 'negative', 'nay'],
        answers = v ? oks : nos,
        answer = ` ${answers[Math.floor(Math.random() * answers.length)]} `;

    return v ?
        chalk.whiteBright.bgGreen(answer) :
        chalk.whiteBright.bgRed(answer);
};

module.exports = configureWebpack;
