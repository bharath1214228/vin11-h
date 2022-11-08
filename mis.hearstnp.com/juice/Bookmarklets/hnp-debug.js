/**
* @author Daniel Lochrie / David Swigger
* 
* debug.js
* This file determines what ad-network is loaded on the page, and 
* calls `lib.js` if DFP is found.
*/

var apsbm = apsbm || {};
apsbm.g = null;

apsbm.scriptPath = 'https://mis.hearstnp.com/juice/Bookmarklets/';
//be sure to comment out the next line when releasing
//apsbm.scriptPath = 'http://localhost:8080/Bookmarklets/';

console.log('Checking for Ad-Network (Google):');
try {
    apsbm.g = googletag || null;
    console.log('Google DFP Found.');
} catch (e) {
    console.log('Could not find instance of Google DFP.');
}

apsbm.loadCommon = function () {
    var js = apsbm.scriptPath + 'JuiceBookmarklet_v3.js';
    js += '?bustcache=' + new Date().getTime(); //bust cache
    var script = document.createElement('script');
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', js);
    document.getElementsByTagName('head')[0].appendChild(script);
}

apsbm.loadStyles = function () {
    var css = apsbm.scriptPath + 'JuiceBookmarkletStyle_V3.css';
    var fileref = document.createElement("link");
    css += '?bustcache=' + new Date().getTime(); //bust cache
    fileref.setAttribute("rel", "stylesheet");
    fileref.setAttribute("type", "text/css");
    fileref.setAttribute("href", css);
    document.getElementsByTagName("head")[0].appendChild(fileref);
}

if(apsbm.runit){
	apsbm.runit();
} else if (apsbm.g) {
    apsbm.loadStyles();
    apsbm.loadCommon();
} else {    
    //Setup globals the rest of the bookmarklet will want to look at
    var g = window;
    g.definedTags = {};
    g.definedTags.ads = [];

    //load it up
    apsbm.loadStyles();
    apsbm.loadCommon();  
}
