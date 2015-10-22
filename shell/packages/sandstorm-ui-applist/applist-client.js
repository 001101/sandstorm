SandstormAppList = function(db, quotaEnforcer, highlight) {
  this._filter = new ReactiveVar("");
  this._sortOrder = new ReactiveVar([["appTitle", 1]]);
  this._staticHost = db.makeWildcardHost("static");
  this._db = db;
  this._quotaEnforcer = quotaEnforcer;
  this._highlight = highlight;
  this._uninstalling = new ReactiveVar(false);
}

var matchesApp = function (needle, app) {
  var appTitle = SandstormDb.appNameFromPackage(app);
  // We match if the app title is matched...
  if (appTitle.toLowerCase().indexOf(needle) !== -1) return true;
  // ...or the metadata's shortDescription matches...
  var shortDesc = SandstormDb.appShortDescriptionFromPackage(app);
  if (shortDesc && shortDesc.toLowerCase().indexOf(needle) !== -1 ) return true;
  // ...or any of the app's action's nouns match.
  for (var i = 0 ; i < app.actions.length ; i++) {
    if (SandstormDb.nounPhraseForActionAndAppTitle(app.actions[i], appTitle).toLowerCase().indexOf(needle) !== -1) return true;
  }
  // Otherwise, nope.
  return false;
};

var compileMatchFilter = function(searchString) {
  var searchKeys = searchString.toLowerCase()
      .split(" ")
      .filter(function(k) { return k !== "";});
  return function matchFilter(item) {
    if (searchKeys.length === 0) return true;
    return _.chain(searchKeys)
        .map(function (searchKey) {return matchesApp(searchKey, item); })
        .reduce(function (a, b) {return a && b; })
        .value();
  };
};

var appToTemplateObject = function(app) {
  var ref = Template.instance().data;
  return {
    iconSrc: app.pkg ? ref._db.iconSrcForPackage(app.pkg, "appGrid") : "",
    appTitle: SandstormDb.appNameFromPackage(app.pkg),
    shortDescription: SandstormDb.appShortDescriptionFromPackage(app.pkg),
    appId: app.appId,
    dev: app.dev,
  };
}

var matchApps = function (searchString) {
  var filter = compileMatchFilter(searchString)

  var db = Template.instance().data._db;
  var allActions = db.currentUserActions().fetch();
  var appsFromUserActionsByAppId = _.chain(allActions)
                             .groupBy('packageId')
                             .pairs()
                             .map(function(pair) {
                                var pkg = db.collections.packages.findOne(pair[0]);
                                return {
                                  packageId: pair[0],
                                  actions: pair[1],
                                  appId: pkg.appId,
                                  pkg: pkg,
                                  dev: false,
                                };
                             })
                             .indexBy('appId')
                             .value();
  var devPackagesByAppId = _.chain(db.collections.devPackages.find().fetch())
                        .map(function(devPackage) {
                          return {
                            packageId: devPackage._id,
                            actions: devPackage.manifest.actions,
                            appId: devPackage.appId,
                            pkg: devPackage,
                            dev: true,
                          };
                        })
                        .indexBy('appId')
                        .value();
  // Merge, making sure that dev apps overwrite user actions if they share appId
  var allApps = _.chain({})
                 .extend(appsFromUserActionsByAppId, devPackagesByAppId)
                 .values()
                 .value();

  var matchingApps = _.chain(allApps)
                      .filter(filter)
                      .value();
  return matchingApps;
};

var nounFromAction = function (action, appTitle) {
  // A hack to deal with legacy apps not including fields in their manifests.
  // I look forward to the day I can remove most of this code.
  // Attempt to figure out the appropriate noun that this action will create.
  // Use an explicit noun phrase is one is available.  Apps should add these in the future.
  if (action.nounPhrase) return action.nounPhrase.defaultText;
  // Otherwise, try to guess one from the structure of the action title field
  if (action.title) {
    var text = action.title.defaultText;
    // Strip a leading "New "
    if (text.lastIndexOf("New ", 0) === 0) {
      var candidate = text.slice(4);
      // Strip a leading appname too, if provided
      if (candidate.lastIndexOf(appTitle, 0) === 0) {
        var newCandidate = candidate.slice(appTitle.length);
        // Unless that leaves you with no noun, in which case, use "instance"
        if (newCandidate.length > 0) {
          return newCandidate.toLowerCase();
        } else {
          return "instance";
        }
      }
      return candidate.toLowerCase();
    }
    // Some other verb phrase was given.  Just use it verbatim, and hope the app author updates
    // the package soon.
    return text;
  } else {
    return "instance";
  }
};

Template.sandstormAppList.helpers({
  setDocumentTitle: function() {
    document.title = "Apps · Sandstorm";
  },
  searching: function() {
    var ref = Template.instance().data;
    return ref._filter.get().length > 0;
  },
  actionsCount: function() {
    var ref = Template.instance().data;
    return ref._db.currentUserActions().count();
  },
  apps: function() {
    var ref = Template.instance().data;
    var apps = matchApps(ref._filter.get());
    return _.chain(apps)
            .map(appToTemplateObject)
            .sortBy(function (appTemplateObj) { return appTemplateObj.appTitle.toLowerCase(); })
            .value();
  },
  popularApps: function() {
    var ref = Template.instance().data;
    // Count the number of grains owned by this user created by each app.
    var actions = ref._db.currentUserActions().fetch();
    var appIds = _.pluck(actions, "appId");
    var grains = ref._db.currentUserGrains().fetch();
    var appCounts = _.countBy(grains, function(x) { return x.appId; });
    // Sort apps by the number of grains created, descending.
    var apps = matchApps(ref._filter.get());
    return _.chain(apps)
        .sortBy(function(app) { return appCounts[app.appId] || 0; })
        .reverse()
        .map(appToTemplateObject)
        .value();
  },
  assetPath: function(assetId) {
    return makeWildcardHost("static") + assetId;
  },
  appMarketUrl: function() {
    var appMarket = Settings.findOne({_id: "appMarketUrl"});
    if (!appMarket) {
      return "#";
    }
    return appMarket.value + "/?host=" + document.location.protocol + "//" + document.location.host;
  },
  isSignedUpOrDemo: function() {
    return this._db.isSignedUpOrDemo();
  },
  shouldHighlight: function () {
    return this.appId === Template.instance().data._highlight;
  },
  showMostPopular: function () {
    // Only show if not searching, not uninstalling, and you have apps installed
    var ref = Template.instance().data;
    return (ref._filter.get().length === 0) &&
           (!ref._uninstalling.get()) &&
           (ref._db.currentUserActions().count() > 0);
  },
  uninstalling: function () {
    return Template.instance().data._uninstalling.get();
  },
  appIsLoading: function () {
    return Template.instance().appIsLoading.get();
  },
});
Template.sandstormAppList.events({
  "click .install-button": function (event) {
    event.preventDefault();
    event.stopPropagation();
    Template.instance().data._quotaEnforcer.ifQuotaAvailable(function () {
      window.open("https://apps.sandstorm.io/?host=" +
          document.location.protocol + "//" + document.location.host, "_blank");
    });
  },
  "click .upload-button": function (event, instance) {
    var input = instance.find(instance.find(".upload-button input"));
    if (input == event.target) { return; } // Click event generated by upload handler.
    instance.data._quotaEnforcer.ifPlanAllowsCustomApps(function () {
      // N.B.: this calls into a global in shell.js.
      // TODO(cleanup): refactor into a safer dependency.
      promptUploadApp(input);
    });
  },
  "click .restore-button": function (event, instance) {
    var input = instance.find(".restore-button input");
    if (input == event.target) { return; } // Click event generated by upload handler.
    instance.data._quotaEnforcer.ifQuotaAvailable(function () {
      // N.B.: this calls into a global in shell.js.
      // TODO(cleanup): refactor into a safer dependency.
      promptRestoreBackup(input);
    });
  },
  "click .uninstall-action": function(event) {
    var db = Template.instance().data._db;
    var appId = this.appId;
    // Untrusted client code may only remove entries by ID.
    db.collections.userActions.find({appId: this.appId}).forEach(function (action) {
      db.collections.userActions.remove(action._id);
    });
    Meteor.call("deleteUnusedPackages", appId);
  },
  "click button.toggle-uninstall": function(event) {
    var uninstallVar = Template.instance().data._uninstalling;
    uninstallVar.set(!uninstallVar.get());
  },
  // We use keyup rather than keypress because keypress's event.currentTarget.value will not
  // have taken into account the keypress generating this event, so we'll miss a letter to
  // filter by
  "keyup .search-bar": function(event) {
    Template.instance().data._filter.set(event.currentTarget.value);
  },
  "keypress .search-bar": function(event, template) {
    var ref = Template.instance().data;
    if (event.keyCode === 13) {
      // Enter pressed.  If a single grain is shown, open it.
      var apps = matchApps(ref._filter.get());
      if (apps.length === 1) {
        Router.go("appDetails", {appId: apps[0].appId});
      }
    }
  }
});
Template.sandstormAppList.onRendered(function () {
  // Scroll to highlighted app, if any.
  if (this.data._highlight) {
    var self = this;
    this.autorun(function (computation) {
      if (self.subscriptionsReady()) {
        var item = self.findAll(".highlight")[0];
        if (item) {
          item.focus();
          item.scrollIntoView();
        }
        computation.stop();
      }
    });
  } else {
    // Auto-focus search bar on desktop, but not mobile (on mobile it will open the software
    // keyboard which is undesirable). window.orientation is generally defined on mobile browsers
    // but not desktop browsers, but some mobile browsers don't support it, so we also check
    // clientWidth. Note that it's better to err on the side of not auto-focusing.
    if (window.orientation === undefined && window.innerWidth > 600) {
      var searchbar = this.findAll(".search-bar")[0];
      if (searchbar) searchbar.focus();
    }
  }
});
Template.sandstormAppList.onCreated(function () {
  this.appIsLoading = new ReactiveVar(false);
});
