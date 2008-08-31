///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// NetFlix Movie Extractor (with IMDB Lookup)
// Version 1.0, 2008-08-31
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name           NetFlix Movie Extractor (with IMDB Lookup)
// @namespace      http://tenhanna.com/greasemonkey
// @description    Extracts your rated NetFlix movies + their IMDB movie ids.
// @include        http://www.netflix.com/*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// This script will scrape the Netflix pages containing your rated movies,
// extract the name, rating, etc, and tries to get the IMDB ID for it.
// (To get to the Ratings page: Movies You'll Love -> Movies You've Rated.)
// An IMDB movie URL can be reconstructed like so:
// 
//     http://www.imdb.com/title/<imdb_id>/
//
// Known Issues:
// - The Netflix total ratings count may be wrong.  In my case, Netflix
//   reports a total of 1054 ratings, but there are only 1053 movies rated.
//   (You can check this by navigating to the last page, and counting the
//   number of ratings on it.  In my case, the last page is 53, and there
//   are only 13 ratings on it.  That's 52 * 20 + 13 = 1053.)
//   Nothing can be done about this; this is a bug on Netflix's side.
// - This script consumes a lot of memory and is CPU intensive, and it is
//   recommended to let it run without doing anything else.
//   If you have a large number of ratings, you may want to edit the script
//   and output less info.
//   For me, with the IMDB lookup option enabled, the Firefox process grew
//   to 321Mb and took 2082 seconds to complete 1053 ratings.
//   The resulting output was 72044 bytes.
//
// Additional known issues when the IMDB lookup option is enabled:
// - Year differences between Netflix and IMDB can lead to an incorrect
//   IMDB movie ID. "Crash" is an example. Netflix has it as made in 2005,
//   but the IMDB year is 2004, and as IMDB also has a movie called "Crash"
//   made in 2005 in its DB, that one will be incorrecly matched to the
//   Netflix version.
//   Nothing can be done about this. Either Netflix or IMDB needs to update
//   their dates.
// - Title and year differences between Netflix and IMDB are the primary
//   reason an IMDB movie ID cannot be resolved. In my case, 184 out of 1053
//   movies weren't found. You'll have to find and add the IMDB IDs for those
//   movies manually. (To find the missing IDs, search for <tab><tab> in the
//   output.)
//   An error is logged whenever the IMDB ID cannot be determined; the script
//   will write the IMDB ID as an empty string and continue.
//
// Additional known issues when both IMDB and "match aliases" options are
// enabled:
// - The "best-effort" movie title matching is only used when the IMDB movie
//   ID cannot be resolved using the Netflix title. In that case, getting an
//   exact match is still likely, but due to the complexity of IMDB's AKA
//   listing, cannot be guaranteed. Be advised that using this version could
//   lead to an incorrect IMDB ID match, so it is recommended only users with
//   lots of foreign movie titles turn this on. (And double-check afterwards
//   that the IDs were correctly identified.)
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

    var _XHR_REQUEST_DELAY = 500;
    var _LET_FUNCTION_EXIT_DELAY = 100;
    var _imdbQueue = [];
    var _totalPages = 0;
    var _totalRatings = 0;
    var _stop = false;
    var _timer = null;

    // _GET_IMDB_DATA
    // Set this to true to get additional IMDB data to match the Netflix data.
    // Set it to false to only get the Netflix data.
    var _GET_IMDB_DATA = true;

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
                'Start NetFlix Movie Extractor (with IMDB Lookup)',
                _startScript);
        GM_registerMenuCommand(
                'Stop NetFlix Movie Extractor (with IMDB Lookup)',
                _stopScript);

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
        tOutput.setAttribute('rows', '7');
        tOutput.setAttribute('cols', '120');

        // Create GUI container.
        var gui = document.createElement('div');
        gui.setAttribute('style',
                'color: #fff; text-align: center; border: 10px solid #8F0707;');
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createTextNode(
                'NetFlix Movie Extractor (with IMDB Lookup)'));
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

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
                'that only users with lots of foreign movie use this '
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
        gui.appendChild(document.createTextNode(
                'Script output (columns are tab-separated):'));
        gui.appendChild(document.createElement('br'));
        gui.appendChild(tOutput);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        // Add GUI to the page.
        document.body.appendChild(gui);
    }

    function _assertScriptIsRunnable() {
        // TODO: check logged in

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
        if (_imdbQueue.length > 0) {
            // Do more work.
            var work = _imdbQueue.shift();

            var delayed = function() { 
                _getImdbId(work);
            }
            _timer = setTimeout(delayed, _XHR_REQUEST_DELAY);
        } else {
            // Done.
            _stopWorking(false);
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
        for (ii=0; ii < unsafe.length; ii++) {
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

        console.info('Fetch:', url);
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

            console.debug('Netflix: '+detail.id+'\t'+detail.title+'\t'
                    +detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'
                    +detail.rating);

            if (_GET_IMDB_DATA) {
                // Make IMDB calls after visiting all ratings pages.
                _imdbQueue.push(detail);
            } else {
                _saveRating(detail);
            }
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

        console.info(logPrefix+':', url);
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
            console.error('Couldn\'t get IMDB id for '+detail.id+':'
                    +title+':'+detail.year);

            // Titles like "2001: A Space Odyssey" are correctly resolved,
            // but titles like "Blade Runner: The Final Cut" are not.
            // Give those that fail another chance and try it without the :*.
            var idx = title.lastIndexOf(':');
            if (idx >= 0) {
                success = false;
                console.error('Trying again with title = '+detail.imdb_title);
    
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
            console.debug('IMDB: '+detail.id+'\t'+detail.title+'\t'
                    +detail.year+'\t'+detail.mpaa+'\t'+detail.genre+'\t'
                    +detail.rating+'\t'+detail.imdb_id+'\t'+detail.imdb_title);

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
        _stopWorking(true);
    }

    function _stopWorking(forced) {
        // Stop any delayed jobs.
        clearTimeout(_timer);
        _timer = null;

        _captureEndState(forced);
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
