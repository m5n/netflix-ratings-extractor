// GetFlix IMDB Grabber
// version 0.2 BETA!
// 2008-06-18
// Copyright (c) 2008, Maarten van Egmond
// Released under the GPL license
// http://www.gnu.org/copyleft/gpl.html
//
// --------------------------------------------------------------------
//
// This is a Greasemonkey user script.
// 
// This script will scrape the Netflix pages containing your rated movies,
// extract the name, rating, etc, and tries to get the IMDB ID for it.
// An IMDB movie URL can be reconstructed like so:
// 
//     http://www.imdb.com/title/<imdb_id>/
//
// Configurable options (requires editing the script):
// - GET_IMDB_DATA
//   Set this flag to true to get additional IMDB data to match the Netflix
//   data.  Set it to false to only get the Netflix data.
// - TRY_AKA_MATCH
//   Set this flag to true to try and match movie aliases in case of conflict.
//   Note: this could lead to an incorrect IMDB id match, so it is recommended
//         only users with lots of foreign movie titles turn this on.
//         (And double-check afterwards that the IDs were correctly identified.)
//
// Known Issues:
// - Occasionally skips processing a Netflix movie. In my case, 10 out
//   of 1000 movies weren't processed.
//   No error is logged; this is a bug that needs to be fixed.
// - Title and year differences between Netflix and IMDB are the primary
//   reason an IMDB movie ID cannot be resolved.  In my case, 100 out of 1000
//   movies weren't found.  You'll have to find and add the IMDB IDs for
//   those movies manually.  (To find the missing IDs, search for 
//   <tab><tab> in the output.)
//   An error is logged whenever the IMDB ID cannot be determined;
//   the script will write the IMDB ID as an empty string and continue.
//
// This script is an enhanced version of Anthony Lieuallen's "getFlix
// Revamped" (http://web.arantius.com/getflix-revamped).
// I removed the server-side data analysis, rewrote the regular
// expression code, and added the IMDB ID fetch.
//
// "getFlix Revamped" is based on Devanshu Mehta's "getFlix" scripts,
// (http://www.scienceaddiction.com/2006/03/03/fetch-your-netflix-ratings/)
// which in turn are based on scripts by John Resig
// (http://ejohn.org/projects/netflix).
//
// Needless to say I'm standing on the shoulders of giants.
//
// --------------------------------------------------------------------
//
// Installation instructions:
// 1. Install Greasemonkey: https://addons.mozilla.org/en-US/firefox/addon/748
// 2. Restart Firefox.
// 3. Load this user script into Firefox: File->Open File, or go to 
//    http://tenhanna.com/greasemonkey/ and choose the script.
// 4. Greasemonkey will ask you to install the script.  Choose Install.
//
// Usage instructions:
// 1. Go to Netflix and log in.
// 2. At bottom of page find the start/stop buttons and results area.
// 3. Click the start button
// 4. When the script finishes, you can copy-and-paste the data in the results
//    area for further processing.  The first row has the column titles.
//    Columns are tab-separated.
//
// Un-installation instructions:
// 1. Tools->Greasemonkey->Manage User Scripts...
// 2. Select the script to uninstall.
// 3. Click Uninstall
//
// --------------------------------------------------------------------
//
// ==UserScript==
// @name           GetFlix IMDB Grabber
// @namespace      http://tenhanna.com/greasemonkey/
// @description    Grabs your rates NetFlix movies, plus their IMDB movie ids.
// @include        http://www.netflix.com/*
// ==/UserScript==

////////////////////////////////////////////////////////////////////////////////

// Configurable options (make edits here):

// GET_IMDB_DATA
// Set this flag to true to get additional IMDB data to match the Netflix data.
// Set it to false to only get the Netflix data.
var GET_IMDB_DATA = true;

// TRY_AKA_MATCH
// Set this flag to true to try and match movie aliases in case of conflict.
// Note: this could lead to an incorrect IMDB id match, so it is recommended
//       only users with lots of foreign movie titles turn this on.
//       (And double-check afterwards that the IDs were correctly identified.)
var TRY_AKA_MATCH = false;

////////////////////////////////////////////////////////////////////////////////

GM_registerMenuCommand('Start GetFlix', startGetFlix);
GM_registerMenuCommand('Stop GetFlix', stopGetFlix);

var button1=document.createElement('button');
button1.setAttribute('style', 'margin: 0.5em 1em; vertical-align: middle;');
button1.appendChild(document.createTextNode('Start'));
button1.addEventListener('click', startGetFlix, true);

var button2=document.createElement('button');
button2.setAttribute('style', 'margin: 0.5em 1em; vertical-align: middle;');
button2.appendChild(document.createTextNode('Stop'));
button2.addEventListener('click', stopGetFlix, true);

var newline=document.createElement('br');

var results=document.createElement('textarea');
results.setAttribute('id', 'getflix_results');
results.setAttribute('rows', '5');
results.setAttribute('cols', '80');

var menu=document.createElement('div');
menu.setAttribute('style', 'text-align: center; border: 10px solid #B9090B;');
menu.appendChild(document.createTextNode('GetFlix:'));
menu.appendChild(button1);
menu.appendChild(button2);
menu.appendChild(newline);
menu.appendChild(results);
document.body.appendChild(menu);

////////////////////////////////////////////////////////////////////////////////

function startGetFlix() {
    // init a single-task queue
    actionQueue=[
        // Write out column titles.
        ['saveRating', {
            'id':'id',
            'title':'title',
            'year':'year',
            'mpaa':'mpaa',
            'genre':'genre',
            'rating':'rating',
            'imdb_id':'imdb_id',
            'imdb_title':'imdb_title'
        }],

        // Fetch first page.
        ['getRatingsPage', 1]
    ];

    // and start the queue running!
    runQueue();
}

function stopGetFlix() {
    // stop the queue runner
    clearTimeout(actionTimer);
    actionTimer=null;
    // and empty out the queue
    actionQueue=[];
}

////////////////////////////////////////////////////////////////////////////////

var niceness=50;
var nicefact=0.33;
function getNice() {
    var min=niceness-(niceness*nicefact);
    var max=niceness+(niceness*nicefact);
    
    // Peek at first action to slow down remote fetches.
    var fac=1;
    if (actionQueue && actionQueue[0]) {
        if ('get'==actionQueue[0][0].substr(0, 3)) fac=100;
    }

    return ( (Math.random()*(max-min)*fac) + min );
}

////////////////////////////////////////////////////////////////////////////////

var actionTimer=null;
var actionQueue=[];
function runQueue() {
    actionTimer=setTimeout(runQueue, getNice());

    var action=actionQueue.shift();
    if (!action) return;

    console.log(
        'Queue length: '+actionQueue.length+'.  Running action '+action[0]+'.'
    );

    switch (action[0]) {
    case 'getRatingsPage':
        getRatingsPage(action[1]);
        break;
    case 'parseRatings':
        parseRatingsPage(action[1], action[2]);
        break;
    case 'getImdbId':
        getImdbId(action[1]);
        break;
    case 'parseImdb':
        parseImdbPage(action[1], action[2]);
        break;
    case 'saveRating':
        saveRating(action[1]);
        break;
    }
}

////////////////////////////////////////////////////////////////////////////////

function getRatingsPage(pagenum) {
    var url='http://www.netflix.com/MoviesYouveSeen?'+
            'pageNum='+parseInt(pagenum, 10);
    console.info('Fetch:', url);
    GM_xmlhttpRequest({
        'method':'GET',
        'url':url,
        'onload':function(xhr) {
            actionQueue.push(['parseRatings', pagenum, xhr.responseText]);
        }
    });
}

////////////////////////////////////////////////////////////////////////////////

function parseRatingsPage(num, text) {
    // Here's the PHP code to find all movie info on a page:
    //$order   = array("\r\n", "\n", "\r");
    //$content = str_replace($order, "", $content);
    //$regex = '|movieid=(.*?)&.*?"list-title"><a.*?>(.*?)<.*?"list-titleyear">.*?\((.*?)\)<.*?"list-mpaa">(.*?)<.*?"list-genre">(.*?)<.*?stars.*?_(\d+?)\.gif|gi';
    //preg_match_all($regex, $content, $matches);

    // Here's the JavaScript version, used by this Greasemonkey script:
    // Note: multiline does not support regex spanning multiple lines...
    //       so, added "(?:.*?\n)*?" before the ".*?stars" part
    var regex = /"list-title"><a.*?\/(\d+?)\?trkid=.*?>(.*?)<.*?"list-titleyear">.*?\((.*?)\)<.*?"list-mpaa">(.*?)<.*?"list-genre">(.*?)<(?:.*?\n)*?.*?stars.*?_(\d+?)\.gif/gim;
    while (regex.test(text)) {
        var detail = {
            'id':RegExp.$1,
            'title':RegExp.$2,
            'year':RegExp.$3,
            'mpaa':RegExp.$4,
            'genre':RegExp.$5,
            'rating':RegExp.$6 / 10
        };

        console.debug('Netflix: '+detail.id+'\t'+detail.title+'\t'+detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'+detail.rating);

        if (GET_IMDB_DATA) {
            actionQueue.push(['getImdbId', detail]);
        } else {
            actionQueue.push(['saveRating', detail]);
        }
    }

    if (text.match(/paginationLink-next/)) {
        actionQueue.push(['getRatingsPage', num+1]);
    }
}

////////////////////////////////////////////////////////////////////////////////

function getImdbId(detail) {
    var logPrefix = "Fetch";
    var title = detail.title;
    if (detail.imdb_title != undefined) {
        // Second try.
        logPrefix = "Fetch-2";
        title = detail.imdb_title;
    }

    var url='http://us.imdb.com/find?type=substring&q='+
            encodeURI(title)+'&sort=smart;tt=1';
    console.info(logPrefix+':', url);
    GM_xmlhttpRequest({
        'method':'GET',
        'url':url,
        'onload':function(xhr) {
            actionQueue.push(['parseImdb', detail, xhr.responseText]);
        }
    });
}

////////////////////////////////////////////////////////////////////////////////

function parseImdbPage(detail, text) {
    var title = detail.title;
    if (detail.imdb_title != undefined) {
        title = detail.imdb_title;
    }

    // Note, "text" can contain either the search results page,
    // or the movie page itself.

    var idIdx = 1;
    var regex = new RegExp("<title>.*?Search.*?</title>", "m");
    if (regex.test(text)) {
        // Multiple search results found.
        // Find first occurrence of movie title + year
        // Return first match only, so don't use g flag.
        // Don't include closing ) in year to match (1998/I) as well.
        regex = new RegExp("<a href=\"/title/(tt\\d+)/\">([\s\w]*?"+title+"[\s\w]*?)</a> \\("+detail.year, "im");
    } else {
        // Went straight to the movie itself.
        // This means IMDB recognized the search string and found an exact
        // match or knew how to interpret the query to locate another match.
        // This happens with '13 Conversations About One Thing', which maps
        // to 'Thirteen Conversations About One Thing'.
        // So, do not verify the movie title.
        // So, verify the movie year only.
        // Return first match only, so don't use g flag.
        // Don't include closing ) in year to match (1998/I) as well.
        regex = new RegExp("<title>(.*?) \\("+detail.year+".*?</title>(?:.*?\n)*?.*?/title/(tt\\d+)/", "im");
        idIdx = 2;
    }

    var success = true;
    if (regex.test(text)) {
        detail.imdb_id = (1 == idIdx ? RegExp.$1 : RegExp.$2);
        detail.imdb_title = (1 == idIdx ? RegExp.$2 : RegExp.$1);
    } else {
        console.error('Couldn\'t get IMDB id for '+detail.id+':'+title+':'+detail.year);

        // Titles like "2001: A Space Odyssey" are correctly resolved,
        // but titles like "Blade Runner: The Final Cut" are not.
        // Give those that fail another chance and try it without the :*.
        var idx = title.lastIndexOf(':');
        if (idx >= 0) {
            detail.imdb_title = detail.title.substring(0, idx);
            actionQueue.push(['getImdbId', detail]);
            success = false;
            console.error('Trying again with title = '+detail.imdb_title);
        }

        // Another possibility is that the title is an alias, or AKA.
        // This happens a lot with foreign films, e.g. Amelie.
        // Solving this case is not easy:
        // 1. At this point, we can't be sure of the title.
        // 2. At this point, there are multiple results listed, each with AKAs.
        // 3. Matching AKAs and movie titles in the IMDB result page is hard.
        // Since we cannot be 100% sure, this has been implemented as a
        // configurable option.  If you want to enable this, set the 
        // TRY_AKA_MATCH flag to true.
        else {
            regex = new RegExp("<a href=\"/title/(tt\\d+)/\">(.*?)</a> \\("+detail.year+"(?:.*?\n)*?.*?aka.*\""+title+"\"", "im");
            if (TRY_AKA_MATCH && regex.test(text)) {
                detail.imdb_id = RegExp.$1;
                detail.imdb_title = RegExp.$2;
            } else {
                // Could not resolve.  Keep IMDB data empty and continue.
                detail.imdb_id = '';
                detail.imdb_title = '';
            }
        }
    }

    if (success) {
        console.debug('IMDB: '+detail.id+'\t'+detail.title+'\t'+detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'+detail.rating+'\t'+detail.imdb_id+'\t'+detail.imdb_title);

        actionQueue.push(['saveRating', detail]);
    }
}

////////////////////////////////////////////////////////////////////////////////

function saveRating(detail) {
    var results = document.getElementById('getflix_results');
    // Write data in same order as column titles.
    results.innerHTML += 
            detail.id + '\t' +
            detail.title + '\t' +
            detail.year + '\t' +
            detail.mpaa + '\t' +
            detail.genre + '\t' +
            detail.rating + '\t' +
            detail.imdb_id + '\t' +
            detail.imdb_title + '\n';
}

////////////////////////////////////////////////////////////////////////////////
