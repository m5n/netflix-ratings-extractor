///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Movie Extractor (with IMDB Lookup)
// Version 1.2, 2008-10-25
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name           Netflix Movie Extractor (with IMDB Lookup)
// @namespace      http://tenhanna.com/greasemonkey
// @author         Maarten
// @version        1.2
// @description    v1.2: Export your Netflix movie ratings and their IMDB movie IDs.
// @include        http://www.netflix.com/*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script will scrape the Netflix pages containing your rated movies,
// extract the name, rating, etc, and tries to get the IMDB ID for it.
// (You can run the script from any Netflix page, but to see your ratings page,
// navigate to: Movies You'll Love -> Movies You've Rated.)
// An IMDB movie URL can be reconstructed like so:
// 
//     http://www.imdb.com/title/<imdb_id>/
//
///////////////////////////////////////////////////////////////////////////////
//
// This script is based on Anthony Lieuallen's "getFlix Revamped"
// (http://web.arantius.com/getflix-revamped).
//
// I completely rewrote Anthony's script for version 1.0 of my script,
// but I learned the GreaseMonkey ropes by studying his script.
//
// "getFlix Revamped" is based on Devanshu Mehta's "getFlix" scripts,
// (http://www.scienceaddiction.com/2006/03/03/fetch-your-netflix-ratings/)
// which in turn are based on scripts by John Resig
// (http://ejohn.org/projects/netflix).
//
// Needless to say I'm standing on the shoulders of giants.
//
///////////////////////////////////////////////////////////////////////////////
//
// The code is a nice example of page scraping.  Netflix does not show how
// many pages with ratings there are, so the script just starts with page 1.
// (If we knew how many pages there were beforehand, we could use some sort
// of work queue; see my Last.FM script.)
// This pattern can be used to do any kind of work if the total amount of work
// is not known beforehand.  To customize this script to fit a different kind
// of work load, just re-implement these functions:
//     _assertScriptIsRunnable
//     _captureStartState
//     _doWork
//     _captureEndState
//
// Other than that there are some hardcoded strings in the GUI itself,
// which can be changed in this function:
//     _buildGui
//
// Note: There is a delay of 500ms between each XHR request.  Any value lower
//       than that causes some queries to return zero results.  You may have
//       to tweak that value if you customize this script for your own needs.
//
///////////////////////////////////////////////////////////////////////////////

// Singleton pattern.
var singleton = (function() {
    //
    // Private variables
    //

    // There is a delay of 500ms between each XHR request.  Any value lower
    // than that causes some queries to return zero results.  You may have
    // to tweak that value if you customize this script for your own needs.
    var _XHR_REQUEST_DELAY = 500;

    var _LET_FUNCTION_EXIT_DELAY = 100;
    var _imdbQueue = [];
    var _imdbQueueIndex = 0;
    var _totalPages = 0;
    var _totalRatings = 0;
    var _stop = false;
    var _timer = null;
    var _startTime = 0;

    // _GET_IMDB_DATA
    // Set this to true to get additional IMDB data to match the Netflix data.
    // Set it to false to only get the Netflix data.
    var _GET_IMDB_DATA = false;

    // _TRY_AKA_MATCH
    // Set this to true to try and match movie aliases in case of conflict.
    // Note: this could lead to an incorrect IMDB id match, so it is
    //       recommended that only users with lots of foreign movie titles
    //       turn this on.  (And double-check afterwards that the IMDB movie
    //       IDs were correctly identified.)
    var _TRY_AKA_MATCH = false;

    //
    // Private functions
    //

    // This function builds the GUI and adds it to the page body.
    function _buildGui() {
        // Add options to the Tools->Greasemonkey->User Script Commands menu.
        GM_registerMenuCommand(
                'Start Netflix Movie Extractor (with IMDB Lookup)',
                _startScript);
        GM_registerMenuCommand(
                'Stop Netflix Movie Extractor (with IMDB Lookup)',
                _stopScript);

        // Create GUI container.
        var gui = document.createElement('div');
        gui.setAttribute('style',
                'color: #fff; text-align: center; margin: 2em 0; '
                + 'padding: 0 1em; border: 10px solid #8F0707;');

        var pElt = document.createElement('p');
        pElt.setAttribute('style', 'font-size: larger; font-weight: bold');
        pElt.appendChild(document.createTextNode(
                'Netflix Movie Extractor (with IMDB Lookup)'));
        gui.appendChild(pElt);

        var realGui;
        if (document.getElementById('profilesmenu')) {
            // User is signed in.
            realGui = _buildSignedInGui();
        } else {
            realGui = _buildNotSignedInGui();
        }
        gui.appendChild(realGui);

        // Add GUI to the page.
        var content = document.getElementById('footer');
        if (!content) {
            content = document.body;
        }
        content.appendChild(gui);
    }

    function _buildNotSignedInGui() {
        var gui = document.createElement('p');
        gui.setAttribute('style', 'font-size: larger');
        gui.appendChild(document.createTextNode(
                'Please log in to use this script.'));
        return gui;
    }

    function _buildSignedInGui() {
        var gui = document.createElement('div');

        // Create start button.
        var bStart = document.createElement('button');
        bStart.setAttribute('style', 'margin: 0.5em; vertical-align: middle;');
        bStart.appendChild(document.createTextNode('Start'));
        bStart.addEventListener('click', _startScript, true);

        // Create stop button.
        var bStop = document.createElement('button');
        bStop.setAttribute('style', 'margin: 0.5em; vertical-align: middle;');
        bStop.appendChild(document.createTextNode('Stop'));
        bStop.addEventListener('click', _stopScript, true);

        // Create _GET_IMDB_DATA option.
        var cGetImdbData = document.createElement('input');
        cGetImdbData.setAttribute('type', 'checkbox');
        cGetImdbData.setAttribute('id', 'getImdbData');
        if (_GET_IMDB_DATA) {
            cGetImdbData.setAttribute('checked', 'checked');
        }

        // Create _TRY_AKA_MATCH option.
        var cTryAkaMatch = document.createElement('input');
        cTryAkaMatch.setAttribute('type', 'checkbox');
        cTryAkaMatch.setAttribute('id', 'tryAkaMatch');
        if (_TRY_AKA_MATCH) {
            cTryAkaMatch.setAttribute('checked', 'checked');
        }

        // Create output area.
        var tOutput = document.createElement('textarea');
        tOutput.setAttribute('id', 'script_output');
        tOutput.setAttribute('style', 'width: 100%; height: 9em');

        var table = document.createElement('table');
        table.setAttribute('align', 'center');

        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.appendChild(cGetImdbData);
        tr.appendChild(td);
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.setAttribute('style', 'color: #fff');
        td.appendChild(document.createTextNode(
                'Check this box to get additional IMDB data to match the '
                + 'Netflix data.'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode(
                'Leave this box unchecked to only get the Netflix data.'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createElement('br'));
        tr.appendChild(td);
        table.appendChild(tr);

        tr = document.createElement('tr');
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.appendChild(cTryAkaMatch);
        tr.appendChild(td);
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.setAttribute('style', 'color: #fff');
        td.appendChild(document.createTextNode(
                'Check this box to try and match IMDB movie aliases in case '
                + 'of conflict.'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode(
                '(This could lead to an incorrect IMDB id match, so it is '
                + 'recommended'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode(
                'that only users with lots of foreign movie titles use this '
                + 'option.'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode(
                'If you do use this option, double-check afterwards that '
                + 'the'));
        td.appendChild(document.createElement('br'));
        td.appendChild(document.createTextNode(
                'IMDB movie IDs were correctly identified.)'));
        tr.appendChild(td);
        table.appendChild(tr);

        gui.appendChild(table);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(bStart);
        gui.appendChild(bStop);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));
        var span = document.createElement('span');
        span.setAttribute('style', 'font-size: larger');
        span.appendChild(document.createTextNode(
                'Script output (columns are tab-separated):'));
        gui.appendChild(span);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(tOutput);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        return gui;
    }

    function _assertScriptIsRunnable() {
        var result = true;

        // TODO: check at least one movie.

        // All ok.
        return true;
    }

    function _captureStartState() {
        _startTime = (new Date()).getTime();

        // Get checkbox options.
        _GET_IMDB_DATA = document.getElementById('getImdbData').checked;
        _TRY_AKA_MATCH = document.getElementById('tryAkaMatch').checked;

        if (_GET_IMDB_DATA) {
            // Let the user know the output will not come immediately.
            alert('Extracting Netflix ratings first, then getting IMDB '
                    + 'details.\nOutput will start once Netflix data has '
                    + 'been extracted.');
        }

        // Write out column titles.
        _saveRating({
                'id': 'id',
                'title': 'title',
                'year': 'year',
                'mpaa': 'mpaa',
                'genre': 'genre',
                'rating': 'rating',
                'imdb_id': 'imdb_id',
                'imdb_title': 'imdb_title'
        });
    }

    function _doWork() {
        // We don't know how many pages of ratings there are yet.
        // So all we can do is start with page 1.
        // As getting ratings pages is asynchronous, queue up all IMDB calls.
        _imdbQueue = [];

        // This is the first request; no need to delay this call.
        _getRatingsPage(1);
    }

    function _doImdbWork() {
        if (_imdbQueueIndex < _imdbQueue.length) {
            // Do more work.
            var work = _imdbQueue[_imdbQueueIndex];
            _imdbQueueIndex++;

            var delayed = function() { 
                _getImdbId(work);
            }
            _timer = setTimeout(delayed, _XHR_REQUEST_DELAY);
        } else {
            // Done.
            _stopWorking(false, false);
        }
    }

    function _captureEndState(forced) {
        // Inform the user about what happened.
        if (forced) {
            _addOutput("Stopped.");
            alert('Stopped.');
        } else {
            var endTime = (new Date()).getTime();
            _addOutput("Done.\nProcessed " + _totalPages + " pages.  Added "
                    + _totalRatings + " ratings.\nScript took "
                    + Math.round((endTime - _startTime)/1000) + " seconds.");

            alert('Done.');
        }
    }

    function _regexEscape(ss) {
        // JavaScript doesn't have \Q ... \E, so escape characters manually.
        // See http://www.perl.com/doc/manual/html/pod/perlre.html
        // for the special characters that appear in regular expressions.
        var unsafe = "\\^.$|()[]*+?{}";
        for (var ii = 0; ii < unsafe.length; ii++) {
            ss = ss.replace(new RegExp("\\" + unsafe.charAt(ii), "g"), "\\" + unsafe.charAt(ii)); 
        }
        return ss;
    }



    //
    // These functions define the sequence of steps to process a work unit.
    //

    function _getRatingsPage(pagenum) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (_stop) {
            return;
        }

        var url = 'http://www.netflix.com/MoviesYouveSeen?' +
                'pageNum=' + parseInt(pagenum, 10);

        //_addOutput('Fetch:' + url);
        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function(xhr) {
                _parseRatingsPage(pagenum, xhr.responseText);
            }
        });
    }

    function _parseRatingsPage(num, text) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (_stop) {
            return;
        }

        _totalPages++;

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
            _totalRatings++;

            var detail = {
                'id': RegExp.$1,
                'title': RegExp.$2,
                'year': RegExp.$3,
                'mpaa': RegExp.$4,
                'genre': RegExp.$5,
                'rating': RegExp.$6 / 10
            };

            //_addOutput('Netflix: '+detail.id+'\t'+detail.title+'\t'
            //        +detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'
            //        +detail.rating);

            if (_GET_IMDB_DATA) {
                // Make IMDB calls after visiting all ratings pages.
                _imdbQueue.push(detail);
            } else {
                _saveRating(detail);
            }
        }

        if (0 === _totalRatings) {
           // Either user has no ratings at all,
           // or user has not enabled the "accept third-party cookies" setting.
           if (text.match(/Once you've enabled cookies, /)) {
               alert('You must enable the "accept third-party cookies" setting.'
                       + '\nSee the output area for instructions.');
               _clearOutput();
               _addOutput('You must enable the "accept third-party cookies" setting:\n1. Windows: Select "Options" from the "Tools" menu.\n   Macintosh: Select "Preferences" from the "Firefox" menu.\n2. Click the "Privacy" icon.\n3. Check the "Accept third-party cookies" checkbox under the "Cookies" section.\n4. Windows: Click "OK" on the "Options" window.\n   Macintosh: Close the "Preferences" window.\n');
               _addOutput('You may disable the "accept third-party cookies" setting again after running the script.');
           }
           _stopWorking(true, true);
           return;
        }

        if (text.match(/paginationLink-next/)) {
            // Next page.
            var delayed = function() {
                _getRatingsPage(num + 1);
            }
            _timer = setTimeout(delayed, _XHR_REQUEST_DELAY);
        } else {
            // Processed all ratings pages; now do IMDB work.
            _doImdbWork();
        }
    }

    function _getImdbId(detail) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (_stop) {
            return;
        }

        var logPrefix = "Fetch";
        var title = detail.title;
        if (detail.imdb_title != undefined) {
            // Second try.
            logPrefix = "Fetch-2";
            title = detail.imdb_title;
        }

        var url = 'http://us.imdb.com/find?type=substring&q=' +
                encodeURI(title) + '&sort=smart;tt=1';

        //_addOutput(logPrefix+': ' + url);
        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function(xhr) {
                _parseImdbPage(detail, xhr.responseText);
            }
        });
    }

    function _parseImdbPage(detail, text) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (_stop) {
            return;
        }

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
            var esc_title = _regexEscape(title);
            regex = new RegExp("<a href=\"/title/(tt\\d+)/\">([\s\w]*?" + esc_title + "[\s\w]*?)</a> \\(" + detail.year, "im");
        } else {
            // Went straight to the movie itself.
            // This means IMDB recognized the search string and found an exact
            // match or knew how to interpret the query to locate another
            // match.  This happens with '13 Conversations About One Thing',
            // which maps to 'Thirteen Conversations About One Thing'.
            // So, do not verify the movie title.
            // So, verify the movie year only.
            // Return first match only, so don't use g flag.
            // Don't include closing ) in year to match (1998/I) as well.
            regex = new RegExp("<title>(.*?) \\(" + detail.year + ".*?</title>(?:.*?\n)*?.*?/title/(tt\\d+)/", "im");
            idIdx = 2;
        }

        var success = true;
        if (regex.test(text)) {
            detail.imdb_id = (1 == idIdx ? RegExp.$1 : RegExp.$2);
            detail.imdb_title = (1 == idIdx ? RegExp.$2 : RegExp.$1);
        } else {
            //_addOutput('Couldn\'t get IMDB id for '+detail.id+':'
            //        +title+':'+detail.year);

            // Titles like "2001: A Space Odyssey" are correctly resolved,
            // but titles like "Blade Runner: The Final Cut" are not.
            // Give those that fail another chance and try it without the :*.
            var idx = title.lastIndexOf(':');
            if (idx >= 0) {
                success = false;
                //_addOutput('Trying again with title = '+detail.imdb_title);
    
                detail.imdb_title = detail.title.substring(0, idx);
                var delayed = function() { 
                    _getImdbId(detail);
                }
                _timer = setTimeout(delayed, _XHR_REQUEST_DELAY);
            }   // The else clause of this if-statement is below.

            // Another possibility is that the title is an alias, or AKA.
            // This happens a lot with foreign films, e.g. Amelie.
            // Solving this case is not easy:
            // 1. At this point, we can't be sure of the title.
            // 2. At this point, there are multiple results listed,
            //    each with AKAs.
            // 3. Matching AKAs and movie titles in the IMDB result page
            //    is hard.
            // Since we cannot be 100% sure, this has been implemented as a
            // configurable option.  If you want to enable this, set the 
            // _TRY_AKA_MATCH flag to true.
            else {
                var esc_title = _regexEscape(title);
                regex = new RegExp("<a href=\"/title/(tt\\d+)/\">(.*?)</a> \\(" + detail.year + "(?:.*?\n)*?.*?aka.*\"" + esc_title + "\"", "im");
                if (_TRY_AKA_MATCH && regex.test(text)) {
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
            //_addOutput('IMDB: '+detail.id+'\t'+detail.title+'\t'
            //        +detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'
            //        +detail.rating+'\t'+detail.imdb_id+'\t'+detail.imdb_title);

            _saveRating(detail);

            // Continue with more IMDB work.
            _doImdbWork();
        }
    }

    function _saveRating(detail) {
        _addOutput('' +
                detail.id + '\t' +
                detail.title + '\t' +
                detail.year + '\t' +
                detail.mpaa + '\t' +
                detail.genre + '\t' +
                detail.rating + '\t' +
                (detail.imdb_id ? detail.imdb_id : '') + '\t' +
                (detail.imdb_title ? detail.imdb_title : ''));
    }



    ///////////////////////////////////////////////////////////////////////
    // Generic start/stop/output functions. (Start)
    ///////////////////////////////////////////////////////////////////////

    // Event handler for the Start button.
    function _startScript() {
        if (!_assertScriptIsRunnable()) {
            return;
        }

        _captureStartState();

        // Start the work!
        _doWork();
    }

    // Event handler for the Stop button.
    function _stopScript() {
        _stop = true;
        _stopWorking(true, false);
    }

    function _stopWorking(forced, beSilent) {
        // Stop any delayed jobs.
        clearTimeout(_timer);
        _timer = null;

        if (!beSilent) {
            _captureEndState(forced);
        }
    }

    // Clears the output area.
    function _clearOutput(msg) {
        var output = document.getElementById('script_output');
        output.value = "";
    }

    // Adds a message to the user-readable output area.
    function _addOutput(msg) {
        var output = document.getElementById('script_output');
        output.value += msg + "\n";
    }

    ///////////////////////////////////////////////////////////////////////
    // Generic start/stop/output functions. (End)
    ///////////////////////////////////////////////////////////////////////



    // Return publicly accessible variables and functions.
    return {
        //
        // Public functions
        // (These access private variables and functions through "closure".)
        //

        // Initialize this script.
        init: function() {
            // Build the GUI for this script.
            _buildGui();

            // Now wait for user to press Start button.
        }
    };
})();
// End singleton pattern.

// Run this script.
singleton.init();

///////////////////////////////////////////////////////////////////////////////
