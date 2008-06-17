// GetFlix IMDB Grabber
// version 0.1 BETA!
// 2008-06-16
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
                'imdb_id':'imdb_id'
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
    var regex = /movieid=(.*?)&.*?"list-title"><a.*?>(.*?)<.*?"list-titleyear">.*?\((.*?)\)<.*?"list-mpaa">(.*?)<.*?"list-genre">(.*?)<(?:.*?\n)*?.*?stars.*?_(\d+?)\.gif/gim;
    while (regex.test(text)) {
        var detail = {
            'id':RegExp.$1,
            'title':RegExp.$2,
            'year':RegExp.$3,
            'mpaa':RegExp.$4,
            'genre':RegExp.$5,
            'rating':RegExp.$6 / 10
        };

        console.debug(detail.id+'\t'+detail.title+'\t'+detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'+detail.rating);

		actionQueue.push(['getImdbId', detail]);
    }

	if (text.match(/paginationLink-next/)) {
		actionQueue.push(['getRatingsPage', num+1]);
	}
}

////////////////////////////////////////////////////////////////////////////////

function getImdbId(detail) {
	var url='http://us.imdb.com/find?type=substring&q='+encodeURI(detail.title)+'&sort=smart;tt=1';
	console.info('Fetch:', url);
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
    // Note, "text" can contain either the search results page, or the movie page itself.

    var regex = new RegExp("<title>.*?Search.*?</title>", "m");
    if (regex.test(text)) {
	// Multiple search results found.
        // Find first occurrence of movie title + year
        regex = new RegExp("<a href=\"/title/(tt\\d+)/\">.*?"+detail.title+".*?</a> \\("+detail.year+"\\)", "im");
    } else {
	// Went straight to the movie itself.
        // Find first occurrence of "/title/tt123456/"
        regex = /\/title\/(tt\d+)\//;
    }

    if (regex.test(text)) {
        detail.imdb_id = RegExp.$1;
    } else {
        console.error('Couldn\'t get IMDB id for '+detail.id+':'+detail.title+':'+detail.year);

        detail.imdb_id = '';
    }

    console.debug(detail.id+'\t'+detail.title+'\t'+detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'+detail.rating+'\t'+detail.imdb_id);

    actionQueue.push(['saveRating', detail]);
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
            detail.imdb_id + '\n';
}

////////////////////////////////////////////////////////////////////////////////
