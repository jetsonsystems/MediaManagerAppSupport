//
//  PLM Media Manager API Router:
//
//    Routing for media manager API endpoints.
//

var _ = require('underscore');
var log4js = require('log4js');
var url = require('url');
var config = require('MediaManagerAppConfig');
var mmApi = require('MediaManagerApi/lib/MediaManagerApiCore')(config);
var Router = require('browserver-router');
var resources = require('./ApiResources');
var apiWorkers = require('./ApiWorkers');

var staticRoutesPat = /^\/(file)|(mm-file-cache)|(css)|(js)|(imgs)|(fonts)|(html)\/*$/;
var handleWithAppJsRouter = function(req) {
  if (req.pathname.match(staticRoutesPat)) {
    return true;
  }
  return false;
};

var handleWithAppRouter = function(req) {
  return !handleWithAppJsRouter(req);
};

//
//  MediaManagerApiRouter: Sets up routing to resources for the Media Manager API.
//
//    Args:
//      appjs - The AppJS application.
//      handleTestFunc - Only handle requests where handleTestFunc returns true.
//
//    Notes:
//
//      Decided to use the browserver-router, see: 
//        * http://github.com/jed/browserver-router or
//        * https://npmjs.org/package/browserver-router. 
//      Reasons for using it:
//        * With it we could instantiate a simple router, unlike Express, we would instantiate an
//          'express server', which at a minimum feels odd even if it works.
//        * The routing is based upon backbone.js's so it will be familiar territory if we use 
//          that on the front end.
//
var MediaManagerRouter = function(appjs, routes) {

  var logger = log4js.getLogger('plm.MediaManagerAppSupport');

  //
  //  initialize: sets up all the routes. Invoked at the end of object construction.
  //
  var initialize = function() {
    var that = this;
    logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.initialize: initializing...');

    //
    //  The original AppJS routing handler.
    //
    var appjsHandler = appjs.router.handle;

    //
    //  Redefine the AppJS routing handler to something which intercepts the request.
    //
    appjs.router.handle = function(req, res) {
      if (handleWithAppJsRouter(req)) {
        logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.js: Routing with appjs router for - ' + req.method + ' ' + req.url);
        appjsHandler.apply(appjs.router, arguments);
      }
      else {
        req.method = req.method.toUpperCase();
        req.originalUrl = req.url;
        req.url = req.pathname;
        if (req.method === 'POST')  {
          logger.info('index.js: Received request - ' + req.method + ' ' + req.url + ', original url - ' + req.originalUrl + ', headers - ' + JSON.stringify(req.headers) + ', post - ' + req.post + ', body - ' + JSON.stringify(req.body));
          //
          //  Currently, cannot add listeners to get data. Data must be sent as URL encoded query args, and is then available via req.data.
          //  So, at least for now, the post code, is the same as the get code, but this will probably change.
          //
          logger.info('index.js: Routing with browserver-router for - ' + req.method + ' ' + req.url + ', original url - ' + req.originalUrl);
          that.router.apply(that.router, arguments);
        }
        else {
          logger.info('index.js: Routing with browserver-router for - ' + req.method + ' ' + req.url + ', original url - ' + req.originalUrl);
          that.router.apply(that.router, arguments);
        }
      }
    };

    logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.initialize: creating router...');
    this.router = new Router(routes);
    logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.initialize: router created!');

    _.each(_.values(resources), function(resource) {

      //
      //  Collection routes:
      //
      logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.initialize: setting up collection routing for request path - ' + resource.requestPath('collection'));
      that.router.route(resource.requestPath('collection'), {

        //
        //  create route (POST resource.path)
        //
        POST: function(req, res) {
          var options = {
            onSuccess: that.genOnSuccess(resource, req, res),
            onError: that.genOnError(resource, req, res)
          };
          var parsedUrl = url.parse(req.originalUrl, true);
          if (_.has(parsedUrl, 'query')) {
            options['query'] = parsedUrl.query;
          }
          //
          //  Need to populate attr with the request body.
          //
          try {
            options.attr = req.body;
          }
          catch (err) {
            //
            // Nuke attr to indicate we do NOT have a valid JSON payload.
            //
            options.attr = undefined;
            delete options.attr;
          }
          //
          // Pass off the request to apiWorkers.doRequest:
          //
          apiWorkers.doRequest(resource, 'POST', options);
        },
        //
        //  index route (GET resource.path)
        //
        GET: function(req, res) {

          logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.js: Routing GET collection request path - ' + resource.requestPath('collection'));

          var options = {
            req: req,
            onSuccess: that.genOnSuccess(resource, req, res),
            onError: that.genOnError(resource, req, res)
          };
          var parsedUrl = url.parse(req.originalUrl, true);
          if (_.has(parsedUrl, 'query')) {
            options['query'] = parsedUrl.query;
          }
          apiWorkers.doRequest(resource, 'GET', options);
        }
      });
      //
      //  Singular instance routes:
      //
      logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.initialize: setting up singular instance routing for request path - ' + resource.requestPath('instance'));
      that.router.route(resource.requestPath('instance'), {

        //
        //  read route (GET resource.path, where resource.path points to an instance)
        //
        GET: function(req, res) {

          logger.info('MediaManagerAppSupport/lib/MediaManagerRouter.js: Routing GET instance request path - ' + resource.requestPath('instance'));

          apiWorkers.doRequest(resource,
                               'GET',
                               {id: req.params[0],
                                onSuccess: that.genOnSuccess(resource, req, res),
                                onError: that.genOnError(resource, req, res)});
        }
      });
    });
  };

  this.genOnSuccess = function(resource, req, res) {
    return function(responseBody) {
      logger.info('index.js: Handling - ' + req.method + ' ' + resource.path + ', response payload of length - ' + JSON.stringify(responseBody).length);
      res.send(200,
               'application/json',
               JSON.stringify(responseBody));
    };
  };

  this.genOnError = function(resource, req, res) {
    return function(responseBody) {
      logger.error('index.js: Handling - ' + req.method + ' ' + resource.path + ', response payload - ' + JSON.stringify(responseBody));
      res.send(resource.httpResponseStatusCode(responseBody),
               'application/json',
               JSON.stringify(responseBody));
    };
  };

  initialize.apply(this);
};

module.exports = MediaManagerRouter;
