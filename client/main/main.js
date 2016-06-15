'use strict';

var $ = require('jquery');

var Coms = require('./coms');
var coms = new Coms();

if (window.location.protocol === 'file:') {

    window.inElectron = true;

    var electron = window.require('electron');

    var remote = electron.remote;
    var mainPort = remote.getGlobal('mainPort');
    var analysisUIPort = remote.getGlobal('analysisUIPort');
    var resultsViewPort = remote.getGlobal('resultsViewPort');

    if (typeof(mainPort) !== 'undefined')
        coms.setBaseUrl('localhost:' + mainPort);

    var ipc = electron.ipcRenderer;
}
else {

    coms.setBaseUrl('');
}


var TableView   = require('./tableview');
var ResultsView = require('./results');
var SplitPanel  = require('./splitpanel');
var ProgressBar = require('./progressbar');
var Backstage   = require('./backstage').View;
var BackstageModel = require('./backstage').Model;
var Ribbon      = require('./ribbon').View;
var RibbonModel = require('./ribbon').Model;
var SplitPanelSection = require('./splitpanelsection');
var OptionsPanel = require('./optionspanel');

var Instance = require('./instance');

var backstageModel = new BackstageModel();
var instance = new Instance({ coms : coms });

var dataSetModel = instance.dataSetModel();

var analyses = instance.analyses();
analyses.set('dataSetModel', dataSetModel);

var ribbonModel = new RibbonModel();

ribbonModel.on('analysisSelected', function(info) {
    analyses.createAnalysis(info.name, info.ns);
});

backstageModel.on('dataSetOpenRequested', function(request) {

    var target;
    var opening;

    if ( ! instance.get('hasDataSet')) {
        target = instance;
        opening = target.open(request.data.path);
        request.waitOn(opening);
        opening.then(function() {
            ribbonModel.set('dataAvailable', true);
        });
    }
    else {
        target = new Instance({ coms : coms });
        request.resolve();
        target.connect().then(function() {
            opening = target.open(request.data.path);
        }).then(function() {
            $.post('http://localhost:' + mainPort + '/launch/' + target.instanceId());
        });
    }
});

backstageModel.on('change:activated', function(event) {
    if (event.changed.activated === false)
        ribbonModel.set('selectedIndex', 1);
});

dataSetModel.on('change:hasDataSet', function() {
    ribbonModel.set('dataAvailable', true);
});

$(document).ready(function() {

    if (navigator.platform === "Win32")
        $('body').addClass("windows");
    else if (navigator.platform == "MacIntel")
        $('body').addClass("mac");
    else
        $('body').addClass("other");

    if (window.inElectron)
        $('body').addClass('electron');

    $(window).on('keydown', function(event) {
        if (event.key === "F10" || event.keyCode === 121)
            ipc.send('request', 'openDevTools');
    });

    if (window.inElectron && navigator.platform === "Win32") {

        $('#close-button').on('click', function() {
            ipc.send('request', 'close');
        });

        $('#min-button').on('click', function() {
            ipc.send('request', 'minimize');
        });

        $('#max-button').on('click', function() {
            ipc.send('request', 'maximize');
        });
    }

    document.oncontextmenu = function() { return false; };

    var ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel });
    var backstage = new Backstage({ el : "#backstage", model : backstageModel });

    ribbonModel.on('change:selectedIndex', function(event) {
        if (event.changed.selectedIndex === 0)
            backstage.activate();
    });

    var halfWindowWidth = $(document).width() * 0.5;
    var optionsFixedWidth = 585;
    var splitPanel  = new SplitPanel({el : "#main-view"});

    splitPanel.addPanel("main-table", { minWidth: 90, initialWidth: halfWindowWidth < (optionsFixedWidth + SplitPanelSection.sepWidth) ? (optionsFixedWidth + SplitPanelSection.sepWidth) : halfWindowWidth, level: 1});
    splitPanel.addPanel("main-options", { minWidth: optionsFixedWidth, maxWidth: optionsFixedWidth, preferredWidth: optionsFixedWidth, visible: false, strongEdge: "right", stretchyEdge: "left", level: 1 });
    splitPanel.addPanel("results", { minWidth: 150, initialWidth: halfWindowWidth, level: 0 });
    splitPanel.addPanel("help", { minWidth: 30, preferredWidth: 200, visible: false, strongEdge: "right", level: 1 });

    instance.on("change:selectedAnalysis", function(event) {
        var analysis = event.changed.selectedAnalysis;
        if (analysis !== null) {
            analysis.ready.then(function() {
                optionspanel.setAnalysis(analysis);
                splitPanel.setVisibility("main-options", true);
            });
        }
        else {
            splitPanel.setVisibility("main-options", false);
        }
    });

    var section = splitPanel.getSection("main-options");
    splitPanel.getSection("results").$panel.find(".hideOptions").click(function() {
        splitPanel.setVisibility("main-options", false);
    });

    var helpSection = splitPanel.getSection("help");
    splitPanel.getSection("results").$panel.find(".hideHelp").click(function() {
        splitPanel.setVisibility("help", helpSection.getVisibility() === false);
    });

    splitPanel.render();

    var mainTable   = new TableView({el : "#main-table", model : dataSetModel });
    var progressBar = new ProgressBar({el : "#progress-bar", model : instance.progressModel() });

    var optionsUrl = 'http://localhost:' + analysisUIPort + '/';
    var optionspanel = new OptionsPanel({ el : "#main-options", iframeUrl : optionsUrl, model : instance });
    optionspanel.setDataSetModel(dataSetModel);

    var resultsUrl = 'http://localhost:' + resultsViewPort + '/';
    var resultsView = new ResultsView({ el : "#results", iframeUrl : resultsUrl, model : instance });

    Promise.resolve(function() {

        return $.post('http://localhost:' + mainPort + '/login');

    }).then(function() {

        return $.getJSON('http://localhost:' + mainPort + '/backstage');

    }).then(function(settings) {

        backstageModel.set('settings', settings);

    }).then(function() {

        return coms.ready;

    }).then(function() {

        var instanceId;
        if (window.location.search.indexOf('?id=') !== -1)
            instanceId = window.location.search.split('?id=')[1];

        return instance.connect(instanceId);

    }).then(function(instanceId) {

        var newUrl = window.location.origin + window.location.pathname + '?id=' + instanceId;
        history.replaceState({}, '', newUrl);

    });
});