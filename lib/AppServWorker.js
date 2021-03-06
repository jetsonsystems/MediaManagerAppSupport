//
// AppServWorker: Webworker which:
//
//  implements 2 services:
//
//  1. REST API
//  2. Notifications Websocket endpoint
//
//  Also, instantiates the AssetManager which uploads assets to remote services such 
//  GoogleDrive.
//
//  AppServWorker listens on 2 ports specfied in the system configuration for each
//  of the above services.
//
var path = require('path');
var fs = require('fs');

var _ = require('underscore');
var Q = require('q');

var osxFs = require('MediaManagerAppSupport/lib/OSXFileSystem');
var log4js = require('log4js');
var log4jsConfigFile = undefined;
if (_.has(process.env, 'LOG4JS_CONFIG')) {
  log4jsConfigFile = process.env.LOG4JS_CONFIG;
}
else {
  log4jsConfigFile = path.join(osxFs.appBundleConfigDir, 'log4js.json');
}
if (!fs.existsSync(log4jsConfigFile)) {
  throw new Error('Unable to find log4js configuration file.');
}
log4js.configure(log4jsConfigFile, { cwd: osxFs.libAppSupportLogDir });

var logger = log4js.getLogger('plm.MediaManagerAppSupport');
var tmp = __filename.split('/');
var logPrefix = tmp[tmp.length-1].replace('.js', ': ');

var config = require('MediaManagerAppConfig');
var apiVersion = config.services.restAPI.version;
var pathPrefix = path.join(config.services.restAPI.pathPrefix, apiVersion);

var assetManagerModule = require('MediaManagerAppSupport/lib/AssetManager.js');
var AppServWorkerMessages = require('MediaManagerAppSupport/lib/AppServWorkerMessages.js');
var mmStorageModule = require('MediaManagerStorage');
var mmStorageInst = mmStorageModule(config.db, {singleton: true});
var mmApi = require('MediaManagerApi/lib/MediaManagerApiCore')(config);

logger.info(logPrefix + 'Starting services...');

var restService = require('MediaManagerAppSupport/lib/AppRestService');

logger.info(logPrefix + 'REST API service started.');

var notifService = require('MediaManagerAppSupport/lib/AppNotifService');

logger.info(logPrefix + 'Notifications API service started.');

//
// Finally, monitor the changes feed.
//
var changesFeed = new mmApi.StorageChangesFeed('/storage/changes-feed',
                                               {instName: 'changes-feed',
                                                pathPrefix: pathPrefix });

var assetManager = undefined;

var appId = undefined;
var dbInfo = undefined;

logger.info(logPrefix + 'Changes feed created...');

//
// onmessage: Process a message, which should describe the request to handle.
//
//  Currently, there is ONE valid message, should be of type 
//  AppServWorkerMessages.LOCAL_STORAGE_READY. Format of the message is:
//
//    e.data.type: AppServWorkerMessages.LOCAL_STORAGE_READY
//    e.data.appId: Application ID
//    e.data.dbInfo: DB info with fields:
//      dbName
//      docCount
//      updateSeq
//      diskSize
//
//  Upon receipt of:
//    * AppServWorkerMessages.LOCAL_STORAGE_READY: we create the
//    changes feed resource to monitor changes to the DB.
//
onmessage = function(e) {
  var lp = logPrefix.replace(': ', '.onmessage: ');
  if (e.data.type === AppServWorkerMessages.LOCAL_STORAGE_READY) {
    //
    //  Do a create request on the changes feed to start monitoring it.
    //
    appId = e.data.appId;
    dbInfo = e.data.dbInfo;
    logger.info(lp + 'Connecting to changes feed, w/ sequence ID - ' + dbInfo.updateSeq + ', app id - ' + appId);
    changesFeed.create({}, 
                       { query: { since: dbInfo.updateSeq,
                                  exclude_app_id: appId } });
    //
    // Instantiate the asset manager to upload originals to GoogleDrive or
    // whatever service we desire.
    //
    logger.info(lp + 'Creating asset manager...');
    assetManager = assetManagerModule(config, 
                                      dbInfo.updateSeq,
                                      {dryRun: false});
    logger.info(lp + 'Asset manager instantiated...');

    var p = Q.promise(
      function(resolve) {
        //
        // Verify the restService and notifService are both ready to go...
        //
        restService.ready(function() {
          resolve();
        });
      });
    p.then(
      function() {
        return Q.promise(function(resolve) {
          //
          // Verify the notifService is ready.
          //
          notifService.ready(function() {
            resolve();
          });
        });
      }
    ).then(
      function() {
        //
        // Both promisses where fullfilled via their callbacks getting invoked!
        //
        postMessage({
          "type": AppServWorkerMessages.APP_SERVER_READY,
        });
      });
  }
  else {
    logger.info(lp + 'Invalid message received by worker, type - ' + e.data.type);
  }
};

//
// onclose: Make sure everything gets close gracefully.
//
onclose = function() {
  restService.shutdown();
  notifService.shutdown();
};
