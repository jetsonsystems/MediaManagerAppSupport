//
// AppRestService: Instantiates a server implementing our REST API endpoints. Each endpoint is
//  in its own web-worker as implemented via apiWorkers.
//
//  Public Methods:
//    ready(callback): Invokes callback() when the rest service is READY to receive requests.
//    shutdown: To shutdown the service.
//
var version = '0.0.1';
var serverName = 'app_rest_service';

var util = require('util');
var path = require('path');
var _ = require('underscore');
var log4js = require('log4js');
var url = require('url');
var restify = require('restify');

var logger = log4js.getLogger('plm.MediaManagerAppSupport');
var tmp = __filename.split('/');
var fname = tmp[tmp.length-1];
var moduleName = fname.replace('.js', '');

var config = require('MediaManagerAppConfig');
var apiResources = require('MediaManagerAppSupport/lib/ApiResources');
var apiWorkers = require('MediaManagerAppSupport/lib/ApiWorkers');

var serverPort = config.services.restAPI.port;

logger.info(moduleName + ': __info__ Starting REST service, host - ' + config.services.restAPI.host + ', port - ' + serverPort);

var server = restify.createServer({name: serverName,
                                   version: version});

server.use(restify.bodyParser({ mapParams: false }));

//
// Router: Our request router.
//
var Router = function() {

  var logPrefix = moduleName + '.Router: ';

  this.initialize = function() {
    var that = this;

    var lp = logPrefix.replace(': ', '.initialize: ');

    logger.debug(lp + '__info__ Initializing...');
    _.each(_.values(apiResources), function(resource) {

      //
      //  Collection routes:
      //

      //
      //  create route (POST resource.path)
      //
      var pat = resource.requestPath('create');
      logger.debug(lp + '__info__ Router configuration; create, request path to match - ' + pat);

      server.opts(pat,
                  function(req, res, next) {
                    res.header('Access-Control-Allow-Origin', 'http://appjs');
                    res.header('Access-Control-Allow-Methods', "POST, GET, OPTIONS");
                    res.header('Access-Control-Allow-Headers', 'Content-Type');
                    res.send(204);
                    return next();
                  });

      server.post(pat,
                  function create(req, res, next) {
                    logger.info(lp + '__request__ method - ' + req.method + ', url - ' + req.url);
                    logger.debug(lp + '__request__ req - ' + util.inspect(req));
                    var options = {
                      onSuccess: that.genOnSuccess(resource, req, res),
                      onError: that.genOnError(resource, req, res)
                    };
                    var parsedUrl = url.parse(req.url, true);
                    if (_.has(parsedUrl, 'query')) {
                      options['query'] = parsedUrl.query;
                    }
                    if (_.has(req, 'body') && req.body) {
                      options.attr = req.body;
                    }
                    res.header('Access-Control-Allow-Origin', 'http://appjs');
                    res.header('Access-Control-Allow-Methods', "POST, GET, OPTIONS");
                    apiWorkers.doRequest(resource, 'POST', options);
                    return next();
                  });

      //
      //  index route (GET resource.path)
      //
      pat = resource.requestPath('index');
      logger.debug(lp + '__info__ Router configuration; index, request path to match - ' + pat);
      server.get(pat,
                 function(req, res, next) {
                   logger.info(lp + '__request__ method - ' + req.method + ', url - ' + req.url);
                   var options = {
                     req: that._reqOption(req),
                     onSuccess: that.genOnSuccess(resource, req, res),
                     onError: that.genOnError(resource, req, res)
                   };
                   var parsedUrl = url.parse(req.url, true);
                   if (_.has(parsedUrl, 'query')) {
                     options['query'] = parsedUrl.query;
                   }
                   res.header('Access-Control-Allow-Origin', 'http://appjs');
                   res.header('Access-Control-Allow-Methods', "GET, OPTIONS");
                   apiWorkers.doRequest(resource, 'GET', options);
                   return next();
                 });

      //
      //  Singular instance routes:
      //

      pat = resource.requestPath('read');
      server.opts(pat,
                  function(req, res, next) {
                    res.header('Access-Control-Allow-Origin', 'http://appjs');
                    res.header('Access-Control-Allow-Methods', "GET, PUT, DELETE, OPTIONS");
                    res.header('Access-Control-Allow-Headers', 'Content-Type');
                    res.send(204);
                    return next();
                  });

      //
      //  read route (GET resource.path, where resource.path points to an instance)
      //
      logger.debug(lp + '__info__ Router configuration; read, request path to match - ' + pat);
      server.get(pat,
                 function(req, res, next) {
                   res.header('Access-Control-Allow-Origin', 'http://appjs');
                   res.header('Access-Control-Allow-Methods', "POST, GET, PUT, OPTIONS");
                   apiWorkers.doRequest(resource, 'GET',
                                        {id: req.params[0],
                                         onSuccess: that.genOnSuccess(resource, req, res),
                                         onError: that.genOnError(resource, req, res)});
                   return next();
                 });

      //
      //  update route (PUT resource.path, where resource.path points to an instance)
      //
      pat = resource.requestPath('update');
      logger.debug(lp + '__info__ Router configuration; update, request path to match - ' + pat);
      server.put(pat,
                 function(req, res, next) {
                   logger.debug(lp + '__request__ id - ' + req.params[0] + ', method - ' + req.method + ', url - ' + req.url);
                   res.header('Access-Control-Allow-Origin', 'http://appjs');
                   res.header('Access-Control-Allow-Methods', "PUT");
                   var options = {
                     id: req.params[0],
                     onSuccess: that.genOnSuccess(resource, req, res),
                     onError: that.genOnError(resource, req, res)
                   };
                   var parsedUrl = url.parse(req.url, true);
                   if (_.has(parsedUrl, 'query')) {
                     options['query'] = parsedUrl.query;
                   }
                   if (_.has(req, 'body') && req.body) {
                     options.attr = req.body;
                   }
                   apiWorkers.doRequest(resource, 'PUT', options);
                   return next();
                 });

      //
      //  delete route (DELETE resource.path, where resource.path points to an instance)
      //
      pat = resource.requestPath('delete');
      logger.debug(lp + '__info__ Router configuration; delete, request path to match - ' + pat);
      server.del(pat,
                 function(req, res, next) {
                   res.header('Access-Control-Allow-Origin', 'http://appjs');
                   res.header('Access-Control-Allow-Methods', "DELETE");
                   var options = {
                     id: req.params[0],
                     onSuccess: that.genOnSuccess(resource, req, res),
                     onError: that.genOnError(resource, req, res)
                   };
                   var parsedUrl = url.parse(req.url, true);
                   if (_.has(parsedUrl, 'query')) {
                     options['query'] = parsedUrl.query;
                   }
                   apiWorkers.doRequest(resource, 'DELETE', options);
                   return next();
                 });
    });
  };

  this.genOnSuccess = function(resource, req, res) {
    return function(responseBody) {
      var lp = logPrefix.replace(': ', '.genOnSuccess.function: ');
      logger.debug('Help!');
      logger.info(lp + '__response__ status - 0, request - ' + req.method + ' ' + req.url + ', response payload of length - ' + JSON.stringify(responseBody).length);
      res.json(200, responseBody);
    };
  };

  this.genOnError = function(resource, req, res) {
    return function(responseBody) {
      var lp = logPrefix.replace(': ', '.genOnError.function: ');
      logger.info(lp + '__response__ status - 1, request - ' + req.method + ' ' + req.url + ', response payload - ' + JSON.stringify(responseBody))
      res.json(resource.httpResponseStatusCode(responseBody), responseBody);
    };
  };

  this._reqOption = function(req) {
    var reqOpt = {};

    if (_.has(req, 'params')) {
      reqOpt.params = req.params;
    }
    return reqOpt;
  };

  this.initialize();
};

var router = new Router();

server.listen(serverPort, function() {
  logger.info(moduleName + ': __start__ ' + serverName + ', listening on port - ' + serverPort);
});

exports.ready = function(callback) {
  var lp = moduleName + '.ready: ';

  logger.info(lp + 'Testing api workers ready state...');
  apiWorkers.ready(function() {
    logger.info(moduleName + '.ready: apiWorkers are ready...');
    callback();
  });
};

exports.shutdown = function() {
  logger.info(moduleName + ': __shutdown__ ' + serverName + ', shutting down...');
  apiWorkers.shutdown();
  server.close();
};
