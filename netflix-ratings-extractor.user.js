///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Movie Ratings Extractor (Includes IMDB Movie Data Lookup)
// Version 1.4, 2009-03-30
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name           Netflix Movie Ratings Extractor (Includes IMDB Movie Data Lookup)
// @namespace      http://userscripts.org/users/64961
// @author         Maarten
// @version        1.4
// @description    v1.4: Export your rated Netflix movies and their IMDB movie IDs.
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
// extract the name, rating, etc, and try to get the IMDB ID for it.
// (To run the script, navigate to: Movies You'll Love -> Movies You've Rated,
// or click on the new "Your Ratings" tab at the top of the page.)
//
// If IMDB lookup is enabled, the IMDB title and year column will only be
// outputted if they differ from Netflix's title and year.
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
// of work queue.)
// This pattern can be used to do any kind of work if the total amount of work
// is not known beforehand.  To customize this script to fit a different kind
// of work load, just re-implement these functions:
//     assertScriptIsRunnable
//     captureStartState
//     doWork
//     captureEndState
//
// Other than that there are some hardcoded strings in the GUI itself,
// which can be changed in this function:
//     buildGui
//
// Note: There is a delay of 500ms between each XHR request.  Any value lower
//       than that causes some queries to return zero results.  You may have
//       to tweak that value if you customize this script for your own needs.
//
///////////////////////////////////////////////////////////////////////////////

// Satisfy JSLint.
/*global alert, clearTimeout, document, GM_registerMenuCommand, GM_xmlhttpRequest, setTimeout */

// Singleton pattern.
var NetflixMovieRatingsExtractor = (function () {
    //
    // Private variables
    //

    // There is a delay of 500ms between each XHR request.  Any value lower
    // than that causes some queries to return zero results.  You may have
    // to tweak that value if you customize this script for your own needs.
    var XHR_REQUEST_DELAY = 500;

    var imdbQueue = [];
    var imdbQueueIndex = 0;
    var totalPages = 0;   // Total pages processed.
    var maxPageNum = 0;   // Maximum #pages.
    var totalRatings = 0;   // Total ratings processed.
    var maxRatingNum = 0;   // Maximum #ratings.
    var stop = false;
    var timer = null;
    var startTime = 0;

    // GET_IMDB_DATA
    // Set this to true to get additional IMDB data to match the Netflix data.
    // Set it to false to only get the Netflix data.
    var GET_IMDB_DATA = false;

    // TRY_AKA_MATCH
    // Set this to true to try and match movie aliases in case of conflict.
    // Note: this could lead to an incorrect IMDB id match, so it is
    //       recommended that only users with lots of foreign movie titles
    //       turn this on.  (And double-check afterwards that the IMDB movie
    //       IDs were correctly identified.)
    var TRY_AKA_MATCH = false;

    // Title match algorithms for IMDB lookups.
    var ALGO_NETFLIX_TITLE = 0;
    var ALGO_NETFLIX_TITLE_SUBSTRING = 1;
    var ALGO_NETFLIX_ALT_TITLE = 2;

    //
    // Private functions
    //

    // Clears the output area.
    function clearOutput(msg) {
        var output = document.getElementById('script_output');
        output.value = "";
    }

    // Adds a message to the user-readable output area.
    function addOutput(msg) {
        var output = document.getElementById('script_output');
        output.value += msg + "\n";

        // Move cursor to the end of the output area.
        output.scrollTop = output.scrollHeight;
    }

    // Sets the message in the user-readable progress area.
    function updateProgress(msg) {
        var output = document.getElementById('script_progress');
        output.innerHTML = msg;
    }

    function saveRating(detail) {
        var result = '';

        if (document.getElementById('col_id').checked) {
            result += detail.id + '\t';
        }
        if (document.getElementById('col_title').checked) {
            result += detail.title + '\t';
        }
        if (document.getElementById('col_alttitle').checked) {
            result += (detail.alt ? detail.alt : '') + '\t';
        }
        if (document.getElementById('col_year').checked) {
            result += detail.year + '\t';
        }
        if (document.getElementById('col_mpaa').checked) {
            result += detail.mpaa + '\t';
        }
        if (document.getElementById('col_genre').checked) {
            result += detail.genre + '\t';
        }
        if (document.getElementById('col_rating').checked) {
            result += detail.rating + '\t';
        }
        if (document.getElementById('col_imdb_id').checked) {
            result += (detail.imdb_id ? detail.imdb_id : '') + '\t';
        }
        if (document.getElementById('col_imdb_title').checked) {
            result += (detail.imdb_title ? detail.imdb_title : '') + '\t';
        }
        if (document.getElementById('col_imdb_year').checked) {
            result += (detail.imdb_year ? detail.imdb_year : '') + '\t';
        }

        // Remove last tab.
        result = result.substring(0, result.length - 1);

        addOutput(result);
    }

    function assertScriptIsRunnable() {
        // TODO: check at least one movie.

        // All ok.
        return true;
    }

    function captureStartState() {
        imdbQueue = [];
        imdbQueueIndex = 0;
        totalPages = 0;
        maxPageNum = 0;
        totalRatings = 0;
        maxRatingNum = 0;
        stop = false;
        timer = null;

        startTime = (new Date()).getTime();

        // Get checkbox options.
        GET_IMDB_DATA = document.getElementById('getImdbData').checked;
        // TODO: when AKA matching is enabled, uncomment the next line.
        //TRY_AKA_MATCH = document.getElementById('tryAkaMatch').checked;

        if (GET_IMDB_DATA) {
            // Let the user know the output will not come immediately.
            alert('Extracting Netflix ratings first, then getting IMDB ' +
                    'details.\nOutput will start once Netflix data has been ' +
                    'extracted.');
        }

        // Write out column titles.
        saveRating(
            {
                'id': 'ID',
                'title': 'Title',
                'alt': 'Alternate Title',
                'year': 'Year',
                'mpaa': 'MPAA',
                'genre': 'Genre',
                'rating': 'Rating',
                'imdb_id': 'IMDB ID',
                'imdb_title': 'IMDB Title',
                'imdb_year': 'IMDB Year'
            }
        );
    }

    function captureEndState(forced) {
        // Inform the user about what happened.
        if (forced) {
            addOutput("Stopped.");
            alert('Stopped.');
        } else {
            var endTime = (new Date()).getTime();
            addOutput("Done.\nProcessed " + totalPages +
                    " pages.  Extracted " + totalRatings +
                    " ratings.\nScript took " +
                    Math.round((endTime - startTime) / 1000) + " seconds.");

            alert('Done.');
        }
    }

    function getRatingsPage(pagenum) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (stop) {
            return;
        }

        var url = 'http://www.netflix.com/MoviesYouveSeen?' +
                'pageNum=' + parseInt(pagenum, 10);

        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function (xhr) {
                parseRatingsPage(pagenum, xhr.responseText);
            }
        });
    }

    function doWork() {
        // We don't know how many pages of ratings there are yet.
        // So all we can do is start with page 1.
        // As getting ratings pages is asynchronous, queue up all IMDB calls.
        imdbQueue = [];

        // Get max #pages and max #ratings.
        // Oops, Netflix has two elements with the same ID.  Work around it.
        //var elt = document.getElementById('nav-rateMovies');
        var elt = document.getElementById('secondaryNav');
        if (elt) {
            var elts = elt.getElementsByTagName('li');
            for (var ee = 0; ee < elts.length; ee++) {
                if (/navItem-current/.test(elts[ee].className)) {
                    elt = elts[ee];
                    break;
                }
            }
        }
        if (elt) {
            if (/\((\d+)\)/.test(elt.innerHTML)) {
                maxRatingNum = RegExp.$1;
                maxPageNum = Math.ceil(maxRatingNum / 20);
            }
        }

        // This is the first request; no need to delay this call.
        getRatingsPage(1);
    }

    ///////////////////////////////////////////////////////////////////////
    // Generic start/stop/output functions. (Start)
    ///////////////////////////////////////////////////////////////////////

    // Event handler for the Start button.
    function startScript() {
        if (!assertScriptIsRunnable()) {
            return;
        }

        captureStartState();

        // Start the work!
        doWork();
    }

    function stopWorking(forced, beSilent) {
        // Stop any delayed jobs.
        clearTimeout(timer);
        timer = null;

        if (!forced) {
            // Clear progress indicator.
            updateProgress('');
        }

        if (!beSilent) {
            captureEndState(forced);
        }
    }

    // Event handler for the Stop button.
    function stopScript() {
        stop = true;
        stopWorking(true, false);
    }

    ///////////////////////////////////////////////////////////////////////
    // Generic start/stop/output functions. (End)
    ///////////////////////////////////////////////////////////////////////



    function buildNotSignedInGui() {
        var gui = document.createElement('p');
        gui.setAttribute('style', 'font-size: larger');
        gui.appendChild(document.createTextNode(
                'Please log in to use this script.'));
        return gui;
    }

    function createFieldset(text) {
        var fieldset = document.createElement('fieldset');
        var legend = document.createElement('legend');
        legend.setAttribute('style', 'color: #fff');
        legend.appendChild(document.createTextNode(text));
        fieldset.appendChild(legend);
        return fieldset;
    }

    function addCheckbox(td, id, text, checked, onChangeFn) {
        var box = document.createElement('input');
        box.setAttribute('type', 'checkbox');
        box.setAttribute('id', id);
        if (checked) {
            box.setAttribute('checked', 'checked');
        }
        if (onChangeFn) {
            box.addEventListener('change', onChangeFn, true);
        }
        var label = document.createElement('label');
        label.setAttribute('style', 'margin-right: 1em');
        label.setAttribute('for', box.id);
        label.appendChild(document.createTextNode(text));
        td.appendChild(box);
        td.appendChild(label);
    }

    function addHeader(td, text) {
        td.setAttribute('align', 'left');
        td.setAttribute('style', 'font-size: larger; color: #fff');
        td.appendChild(document.createTextNode(text));
    }

    function getImdbDataChanged(changeColumnOptions) { 
        var ids, ii;
        var radio = document.getElementById('getImdbData');
        var value = radio.checked;

        if (changeColumnOptions !== false) {
            // Keep IMDB columns in sync.
            ids = ['col_imdb_id', 'col_imdb_title', 'col_imdb_year'];
            for (ii = 0; ii < ids.length; ii++) {
                radio = document.getElementById(ids[ii]);
                radio.checked = value;
            }
        }

        if (value) {
            // IMDB match needs certain Netflix columns, so select them.
            ids = ['col_title', 'col_alttitle', 'col_year'];
            for (ii = 0; ii < ids.length; ii++) {
                radio = document.getElementById(ids[ii]);
                radio.checked = true;
            }
        // TODO: when AKA matching is enabled, uncomment this else block.
        //} else {
        //    // Also uncheck child radio inputs.
        //    radio = document.getElementById('tryAkaMatch');
        //    radio.checked = false;
        }
    }

    function isImdbColOptionChecked() {
        var result = false;

        var ids = ['col_imdb_id', 'col_imdb_title', 'col_imdb_year'];
        for (var ii = 0; ii < ids.length; ii++) {
            var radio = document.getElementById(ids[ii]);
            if (radio.checked) {
                result = true;
                break;
            }
        }

        return result;
    }

    function tryAkaMatchChanged() {
        var radio = document.getElementById('tryAkaMatch');
        if (radio.checked) {
            // Also check parent radio inputs.
            radio = document.getElementById('getImdbData');
            radio.checked = true;

            var changeColumnOptions = !isImdbColOptionChecked();
            getImdbDataChanged(changeColumnOptions);
        }
    }

    function imdbColOptionsChanged() {
        var radio = document.getElementById('getImdbData');
        radio.checked = isImdbColOptionChecked();
        getImdbDataChanged(false);   // Don't change column options.
    }

    function buildSignedInGui() {
        var gui = document.createElement('div');

        // Create start button.
        var bStart = document.createElement('button');
        bStart.setAttribute('style', 'margin: 0.5em; vertical-align: middle;');
        bStart.appendChild(document.createTextNode('Start'));
        bStart.addEventListener('click', startScript, true);

        // Create stop button.
        var bStop = document.createElement('button');
        bStop.setAttribute('style', 'margin: 0.5em; vertical-align: middle;');
        bStop.appendChild(document.createTextNode('Stop'));
        bStop.addEventListener('click', stopScript, true);

        // Create extra tab to go directly to your ratings.
        var nav = document.getElementById('primaryNav');
        var liElt = document.createElement('li');
        liElt.setAttribute('id', 'yrTab');   // your ratings tab
        liElt.setAttribute('class', 'navItem short');
        var aElt = document.createElement('a');
        aElt.setAttribute('title', 'View your movie ratings');
        aElt.setAttribute('href', 'http://www.netflix.com/MoviesYouveSeen');
        var span1Elt = document.createElement('span');
        span1Elt.setAttribute('class', 'w1');
        var span2Elt = document.createElement('span');
        span2Elt.setAttribute('class', 'w2');
        span2Elt.appendChild(document.createTextNode('Your Ratings'));
        span1Elt.appendChild(span2Elt);
        aElt.appendChild(span1Elt);
        liElt.appendChild(aElt);
        nav.appendChild(liElt);

        // If we're on the ratings page, fake the tab being selected.
        if (0 === document.URL.indexOf(
                'http://www.netflix.com/MoviesYouveSeen')) {
            var curLiElt = document.getElementById('rTab');
            var tmp = curLiElt.getAttribute('class');
            curLiElt.setAttribute('class', liElt.getAttribute('class'));
            liElt.setAttribute('class', tmp);
        } else {
            // Don't show the control panel on any other page.
            return;
        }

        // Note: the rest is only executed if we're on the ratings page.

        // Create GET_IMDB_DATA option.
        var cGetImdbData = document.createElement('input');
        cGetImdbData.setAttribute('type', 'checkbox');
        cGetImdbData.setAttribute('id', 'getImdbData');
        if (GET_IMDB_DATA) {
            cGetImdbData.setAttribute('checked', 'checked');
        }
        cGetImdbData.addEventListener('change', getImdbDataChanged, true);

        // Create TRY_AKA_MATCH option.
        var cTryAkaMatch = document.createElement('input');
        cTryAkaMatch.setAttribute('type', 'checkbox');
        cTryAkaMatch.setAttribute('id', 'tryAkaMatch');
        if (TRY_AKA_MATCH) {
            cTryAkaMatch.setAttribute('checked', 'checked');
        }
        cTryAkaMatch.addEventListener('change', tryAkaMatchChanged, true);

        // Create output area.
        var tOutput = document.createElement('textarea');
        tOutput.setAttribute('id', 'script_output');
        tOutput.setAttribute('style', 'width: 100%; height: 9em');

        var maintable = document.createElement('table');
        maintable.setAttribute('align', 'center');

        var tr = document.createElement('tr');
        var td = document.createElement('td');
        var fieldset = createFieldset('Netflix Options');
        td.appendChild(fieldset);
        tr.appendChild(td);
        maintable.appendChild(tr);

        var table = document.createElement('table');

        tr = document.createElement('tr');
        td = document.createElement('td');
        addHeader(td, 'Export these ratings only:');
        tr.appendChild(td);
        table.appendChild(tr);

        tr = document.createElement('tr');
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('style', 'color: #fff');
        addCheckbox(td, 'rating5', '5 Stars', true);
        addCheckbox(td, 'rating4', '4 Stars', true);
        addCheckbox(td, 'rating3', '3 Stars', true);
        addCheckbox(td, 'rating2', '2 Stars', true);
        addCheckbox(td, 'rating1', '1 Star', true);
        addCheckbox(td, 'rating0', 'Not Interested', true);
        tr.appendChild(td);
        table.appendChild(tr);

        tr = document.createElement('tr');
        td = document.createElement('td');
        td.appendChild(document.createElement('br'));
        tr.appendChild(td);
        table.appendChild(tr);

        tr = document.createElement('tr');
        td = document.createElement('td');
        addHeader(td, 'Export these columns only:');
        tr.appendChild(td);
        table.appendChild(tr);

        tr = document.createElement('tr');
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('style', 'color: #fff');
        addCheckbox(td, 'col_id', 'ID', true);
        addCheckbox(td, 'col_title', 'Title', true);
        addCheckbox(td, 'col_alttitle', 'Alternate Title', true);
        addCheckbox(td, 'col_year', 'Year', true);
        addCheckbox(td, 'col_mpaa', 'MPAA', true);
        addCheckbox(td, 'col_genre', 'Genre', true);
        addCheckbox(td, 'col_rating', 'Rating', true);
        addCheckbox(td, 'col_imdb_id', 'IMDB ID', false,
                imdbColOptionsChanged);
        addCheckbox(td, 'col_imdb_title', 'IMDB Title', false,
                imdbColOptionsChanged);
        addCheckbox(td, 'col_imdb_year', 'IMDB Year', false,
                imdbColOptionsChanged);
        tr.appendChild(td);
        table.appendChild(tr);
        fieldset.appendChild(table);

        tr = document.createElement('tr');
        td = document.createElement('td');
        td.appendChild(document.createElement('br'));
        tr.appendChild(td);
        maintable.appendChild(tr);

        fieldset = createFieldset('IMDB Options');
        tr = document.createElement('tr');
        td = document.createElement('td');
        td.appendChild(fieldset);
        tr.appendChild(td);
        maintable.appendChild(tr);

        table = document.createElement('table');
        tr = document.createElement('tr');
        td = document.createElement('td');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.appendChild(cGetImdbData);
        tr.appendChild(td);
        td = document.createElement('td');
        td.setAttribute('colspan', '2');
        td.setAttribute('align', 'left');
        td.setAttribute('valign', 'top');
        td.setAttribute('style', 'color: #fff');
        var label = document.createElement('label');
        label.setAttribute('for', cGetImdbData.id);
        label.appendChild(document.createTextNode(
                'Check this box to get additional IMDB data to match the ' +
                'Netflix data.'));
        td.appendChild(label);
        td.appendChild(document.createElement('br'));
        label = document.createElement('label');
        label.setAttribute('for', cGetImdbData.id);
        label.appendChild(document.createTextNode(
                'Leave this box unchecked to only get the Netflix data.'));
        td.appendChild(label);
        // TODO: when AKA matching is enabled, uncomment the next two lines.
        //td.appendChild(document.createElement('br'));
        //td.appendChild(document.createElement('br'));
        tr.appendChild(td);
        table.appendChild(tr);

        // TODO: once AKA matching is perfected, enable this option.
        //       until then, don't use it.
        //tr = document.createElement('tr');
        //td = document.createElement('td');
        //tr.appendChild(td);
        //td = document.createElement('td');
        //td.setAttribute('align', 'left');
        //td.setAttribute('valign', 'top');
        //td.appendChild(cTryAkaMatch);
        //tr.appendChild(td);
        //td = document.createElement('td');
        //td.setAttribute('align', 'left');
        //td.setAttribute('valign', 'top');
        //td.setAttribute('style', 'color: #fff');
        //label = document.createElement('label');
        //label.setAttribute('for', cTryAkaMatch.id);
        //label.appendChild(document.createTextNode(
        //        'Check this box to try and match IMDB movie aliases in case ' +
        //        'of conflict.'));
        //td.appendChild(label);
        //td.appendChild(document.createElement('br'));
        //label = document.createElement('label');
        //label.setAttribute('for', cTryAkaMatch.id);
        //label.appendChild(document.createTextNode(
        //        '(This could lead to an incorrect IMDB id match, so only ' +
        //        'users with lots of foreign movie titles should use this ' +
        //        'option.'));
        //td.appendChild(label);
        //td.appendChild(document.createElement('br'));
        //label = document.createElement('label');
        //label.setAttribute('for', cTryAkaMatch.id);
        //label.appendChild(document.createTextNode(
        //        'If you use this option, double-check afterwards that the ' +
        //        'IMDB movie IDs were correctly identified.)'));
        //td.appendChild(label);
        //tr.appendChild(td);
        //table.appendChild(tr);

        fieldset.appendChild(table);

        gui.appendChild(maintable);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(bStart);
        gui.appendChild(bStop);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        // Create progress area.
        var span = document.createElement('span');
        span.setAttribute('style', 'font-size: larger; float: right;');
        span.setAttribute('id', 'script_progress');
        gui.appendChild(span);

        span = document.createElement('span');
        span.setAttribute('style', 'font-size: larger; float: left');
        span.appendChild(document.createTextNode(
                'Script output (columns are tab-separated):'));
        gui.appendChild(span);
        gui.appendChild(tOutput);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        return gui;
    }

    // This function builds the GUI and adds it to the page body.
    function buildGui() {
        // Add options to the Tools->Greasemonkey->User Script Commands menu.
        GM_registerMenuCommand(
                'Start Netflix Movie Ratings Extractor (Includes IMDB Movie Data Lookup)',
                startScript);
        GM_registerMenuCommand(
                'Stop Netflix Movie Ratings Extractor (Includes IMDB Movie Data Lookup)',
                stopScript);

        // Create GUI container.
        var gui = document.createElement('div');
        gui.setAttribute('style',
                'color: #fff; text-align: center; margin: 2em 0; ' +
                'padding: 0 1em; border: 10px solid #8F0707;');

        var pElt = document.createElement('p');
        pElt.setAttribute('style', 'font-size: larger; font-weight: bold');
        pElt.appendChild(document.createTextNode(
                'Netflix Movie Ratings Extractor (Includes IMDB Movie Data Lookup)'));
        gui.appendChild(pElt);

        if (document.getElementById('profilesmenu')) {
            // User is signed in.
            var realGui = buildSignedInGui();
            gui.appendChild(realGui);

            // Add GUI to the page.
            var content = document.getElementById('footer');
            if (!content) {
                content = document.body;
            }
            content.appendChild(gui);
        }
    }

    function html_entity_decode(str) {
        var elt = document.createElement('textarea');
        elt.innerHTML = str.replace(/</g, '<').replace(/>/g, '>');
        var result = elt.value;
        elt = null;
        return result;
    }

    function trim(str) {
        return str.replace(/^\s*(\S*(\s+\S+)*)\s*$/, "$1");
    }

    function imdbifyTitle(title) {
        // IMDB search result list movie titles with leading articles moved
        // to the end.  (Actually, does it based on the country-specific
        // rules... El Dorado is shown both as El Dorado and Dorado, El.
        // As much as possible, mimic that behavior here.
        // If this becomes problematic, do this for "foreign" genres only.

        // The articles are used "as-is", so there must be a space after
        // each one in most cases.
        var articles = ["EL ", "LA ", "LE ", "IL ", "L'"];
        for (var aa = 0; aa < articles.length; aa++) {
            var article = articles[aa].toUpperCase();
            if (0 === title.toUpperCase().indexOf(article)) {
                // Move article to the end of the string.
                article = title.substring(0, article.length);
                title = title.substring(article.length) + ', ' + trim(article);
                break;
            }
        }

        return title;
    }

    function getTitleUsedForImdbSearch(detail, titleAlgorithm) {
        var result;

        if (ALGO_NETFLIX_TITLE === titleAlgorithm) {
            result = detail.title;
        } else if (ALGO_NETFLIX_ALT_TITLE === titleAlgorithm) {
            result = detail.alt;
        } else {
            // Another try.
            result = detail.imdb_title;
        }

        return result;
    }

    function getImdbId(detail, titleAlgorithm) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (stop) {
            return;
        }

        var title = getTitleUsedForImdbSearch(detail, titleAlgorithm);
        title = imdbifyTitle(title);
        title = encodeURIComponent(title);

        // For some reason, the "é" character in titles like "Le Fabuleux
        // Destin d'Amélie Poulain" is encoded as "%A9" by encodeURIComponent
        // in stead of "%E9" (which encodeURI does do correctly).  When
        // searching for this title directly from the IMDB search box, IMDB
        // converts this character to "%E9" as well.  Since "%A9" gives no
        // results, and since "%A9" is the copyright symbol and should never
        // appear in movie titles, just replace it.
        // TODO: get to the bottom of this.
        title = title.replace(/%A9/g, '%E9');

        var url = 'http://www.imdb.com/find?s=tt&q=' + title;

        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function (xhr) {
                parseImdbPage(detail, titleAlgorithm, xhr.responseText);
            }
        });
    }

    function doImdbWork() {
        if (imdbQueueIndex < imdbQueue.length) {
            // Update progress.
            updateProgress('Fetching IMDB IDs: ' +
                    Math.floor(100 * imdbQueueIndex / imdbQueue.length) +
                    '% completed');

            // Do more work.
            var work = imdbQueue[imdbQueueIndex];
            imdbQueueIndex++;

            var delayed = function () { 
                var algo = ALGO_NETFLIX_TITLE;
                if (work.alt) {
                    // Especially for foreign titles, starting with the 
                    // alternate title gives the best chance for a match.
                    algo = ALGO_NETFLIX_ALT_TITLE;
                }
                getImdbId(work, algo);
            };
            timer = setTimeout(delayed, XHR_REQUEST_DELAY);
        } else {
            // Done.
            stopWorking(false, false);
        }
    }

    function regexEscape(ss) {
        // JavaScript doesn't have \Q ... \E, so escape characters manually.
        // See http://www.perl.com/doc/manual/html/pod/perlre.html
        // for the special characters that appear in regular expressions.
        var unsafe = "\\^.$|()[]*+?{}";
        for (var ii = 0; ii < unsafe.length; ii++) {
            ss = ss.replace(new RegExp("\\" + unsafe.charAt(ii), "g"),
                    "\\" + unsafe.charAt(ii)); 
        }
        return ss;
    }



    //
    // These functions define the sequence of steps to process a work unit.
    //

    function stopEarly(rating) {
        var result = true;

        // Include current rating in test.
        do {
            if (document.getElementById('rating' + rating).checked) {
                result = false;
            }
        } while (--rating >= 0);

        return result;
    }

    function cleanDetail(detail) {
        if (!document.getElementById('col_id').checked) {
            delete detail.id;
        }
        if (!document.getElementById('col_title').checked) {
            delete detail.title;
        }
        if (!document.getElementById('col_alttitle').checked) {
            delete detail.alt;
        }
        if (!document.getElementById('col_year').checked) {
            delete detail.year;
        }
        if (!document.getElementById('col_mpaa').checked) {
            delete detail.mpaa;
        }
        if (!document.getElementById('col_genre').checked) {
            delete detail.genre;
        }
        if (!document.getElementById('col_rating').checked) {
            delete detail.rating;
        }
        if (!document.getElementById('col_imdb_id').checked) {
            delete detail.imdb_id;
        }
        if (!document.getElementById('col_imdb_title').checked) {
            delete detail.imdb_title;
        }
        if (!document.getElementById('col_imdb_year').checked) {
            delete detail.imdb_year;
        }

        return detail;
    }

    function parseRatingsPage(num, text) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (stop) {
            return;
        }

        // Update progress.
        if (0 !== maxRatingNum) {
            updateProgress('Fetching page ' + num + ' of ' + maxPageNum +
                    ' pages (' + Math.floor(100 * num / maxPageNum) + '%)');
        } else {
            updateProgress('Fetching page ' + num + '...');
        }

        totalPages++;
        var seenOne = false;
        var stopNow = false;

        // JavaScript does not support regex spanning multiple lines...
        // So, added "(?:.*?\n)*?" before the ".*?stars" part.
        var regex = /"list-title"><a.*?\/(\d+?)\?trkid=.*?>(.*?)<.*?"list-titleyear">.*?\((.*?)\)<.*?("list-alttitle">(.*?)<.*?)?"list-mpaa">(.*?)<.*?"list-genre">(.*?)<(?:.*?\n)*?.*?stars.*?_(\d+?)\.gif/gim;
        while (regex.test(text)) {
            seenOne = true;

            // TODO: account for 1/2 star ratings.
            var rating = Math.floor(RegExp.$8 / 10);

            // If no other ratings need to be exported, stop early.
            if (stopEarly(rating)) {
                stopNow = true;
                break;
            }
            if (!document.getElementById('rating' + rating).checked) {
                continue;
            }
            totalRatings++;

            var detail = {
                'id': RegExp.$1,
                'title': RegExp.$2,
                'year': RegExp.$3,
                'alt': RegExp.$5,
                'mpaa': RegExp.$6,
                'genre': RegExp.$7,
                'rating': RegExp.$8 / 10
            };

            if (GET_IMDB_DATA) {
                // Make IMDB calls after visiting all ratings pages.

                // Save memory by only storing values for columns of interest.
                detail = cleanDetail(detail);

                imdbQueue.push(detail);
            } else {
                saveRating(detail);
            }
        }

        if (!seenOne && totalRatings === 0) {
            // Either user has no ratings at all,
            // or user has not enabled the "accept third-party cookies" setting.
            if (text.match(/Once you've enabled cookies, /)) {
                alert('You must enable the "accept third-party cookies" ' +
                        'setting.\nSee the output area for instructions.');
                clearOutput();
                addOutput('You must enable the "accept third-party cookies" ' +
                        'setting:\n1. Windows: Select "Options" from the ' +
                        '"Tools" menu.\n   Macintosh: Select "Preferences" ' +
                        'from the "Firefox" menu.\n2. Click the "Privacy" ' +
                        'icon.\n3. Check the "Accept third-party cookies" ' +
                        'checkbox under the "Cookies" section.\n4. Windows: ' +
                        'Click "OK" on the "Options" window.\n   Macintosh: ' +
                        'Close the "Preferences" window.\n');
                addOutput('You may disable the "accept third-party cookies" ' +
                        'setting again after running the script.');
            }
            stopWorking(true, true);
            return;
        }

        if (!stopNow && text.match(/paginationLink-next/)) {
            // Next page.
            var delayed = function () {
                getRatingsPage(num + 1);
            };
            timer = setTimeout(delayed, XHR_REQUEST_DELAY);
        } else {
            // Processed all ratings pages; now do IMDB work.
            doImdbWork();
        }
    }

    function parseImdbPage(detail, titleAlgorithm, text) {
        // As no queue is used for scraping the ratings pages,
        // need to check explicitly before going to next page.
        if (stop) {
            return;
        }

        // Note: "text" can contain either the search results page or the
        // movie page itself.

        var title, esc_title, delayed;
        var regType = 1;
        var regex = new RegExp("<title>.*?Search.*?</title>", "m");
        if (regex.test(text)) {
            // Multiple search results found.

            // Find first occurrence of movie title + year
            // Return first match only, so don't use g flag.
            // Don't include closing ) in year to match (1998/I) as well.
            // First occurrence would use imdbified title.
            title = getTitleUsedForImdbSearch(detail, titleAlgorithm);
            esc_title = regexEscape(imdbifyTitle(title));

            // NOTE: THAT ALL HTML ENTITIES WILL BE CONVERTED TO REGULAR
            // CHARACTERS, SO DON'T USE HTML ENTITIES IN THE REGEX BELOW,
            // EVEN THOUGH THERE MAY BE HTML ENTITIES IN THE PAGE SOURCE!
            regex = new RegExp("<a href=\"/title/(tt\\d+)/\".*?>\"?(" + esc_title + ")\"?</a> \\((" + detail.year + ")", "i");
        } else {
            // Went straight to the movie itself.
            // This means IMDB recognized the search string and found an exact
            // match or knew how to interpret the query to locate another
            // match.  This happens with '13 Conversations About One Thing',
            // which maps to 'Thirteen Conversations About One Thing'.
            // And then there are the "imdbified" titles...

            // Actually, let's trust IMDB, regardless of year.
            //// So, do not verify the movie title; verify the movie year only.
            //// Return first match only, so don't use g flag.
            //// Don't include closing ) in year to match (1998/I) as well.
            //regex = new RegExp("<title>(.*?) \\(" + detail.year + ".*?</title>(?:.*?\n)*?.*?/title/(tt\\d+)/", "im");
            // NOTE: THAT ALL HTML ENTITIES WILL BE CONVERTED TO REGULAR
            // CHARACTERS, SO DON'T USE HTML ENTITIES IN THE REGEX BELOW,
            // EVEN THOUGH THERE MAY BE HTML ENTITIES IN THE PAGE SOURCE!
            regex = new RegExp("<title>(.*?) \\((.*?)\\).*?</title>(?:.*?\n)*?.*?/title/(tt\\d+)/", "im");
            regType = 2;
        }

        // For foreign movie titles like "Le Fabuleux Destin d'Amélie
        // Poulain" special characters may be encoded as HTML entities,
        // e.g. "é" -> "&#233;".  In JavaScript, it's hard to encode
        // special characters as HTML entities, but decoding them is easy.
        // So, let's do that here.
        // Also, this helps make extracted strings readable for the user.
        // NOTE: THE LINE BELOW CONVERTS ALL HTML ENTITIES TO REGULAR
        // CHARACTERS SO THE REGEX ABOVE SHOULD NOT CONTAIN ANY HTML ENTITIES!
        text = html_entity_decode(text);

        var success = false;
        if (regex.test(text)) {
            success = true;
            detail.imdb_id = (1 === regType ? RegExp.$1 : RegExp.$3);
            detail.imdb_title = (1 === regType ? RegExp.$2 : RegExp.$1);
            detail.imdb_year = (1 === regType ? RegExp.$3 : RegExp.$2);


        // Else no match.  Only try AKA match if requested by the user.

        // The AKA matching routine can only be done for exact title
        // or exact alternate title searches.  It's too error-prone for
        // using with any of the SUBSTRING algorithms.
        } else if (TRY_AKA_MATCH &&
                ALGO_NETFLIX_TITLE_SUBSTRING !== titleAlgorithm) {
            // Another possibility is that the title is an alias, or AKA.
            // This happens a lot with foreign films, e.g. "The Machinist"
            // (which is listed under "El Maquinista").
            // Solving this case is not easy:
            // 1. At this point, we can't be sure of the title.
            // 2. At this point, there are multiple results listed,
            //    each with AKAs.
            // 3. Matching AKAs and movie titles in the IMDB result page
            //    is hard.
            // Since we cannot be 100% sure, this has been implemented as a
            // configurable option.  If you want to enable this, set the 
            // TRY_AKA_MATCH flag to true.

            // AKA titles do NOT use imdbified title.
            title = getTitleUsedForImdbSearch(detail, titleAlgorithm);
            esc_title = regexEscape(title);

            // 1.3: regex = new RegExp("<a href=\"/title/(tt\\d+)/\">(.*?)</a> \\(" + detail.year + "(?:.*?\n)*?.*?aka.*\"" + esc_title + "\"", "im");
            regex = new RegExp("<a href=\"/title/(tt\\d+)/\".*?>(.*?)</a> \\((" + detail.year + ").*?aka <em>\"" + esc_title + "\"", "im");
            if (regex.test(text)) {
                success = true;
                detail.imdb_id = RegExp.$1;
                detail.imdb_title = RegExp.$2;
                detail.imdb_year = RegExp.$3;
            }
        }

        if (!success) {
            // No match.  Try different title match algorithms.

            if (ALGO_NETFLIX_ALT_TITLE === titleAlgorithm) {
                // Tried alternate title first, now try real title second.
                success = false;
    
                delayed = function () { 
                    getImdbId(detail, ALGO_NETFLIX_TITLE);
                };
                timer = setTimeout(delayed, XHR_REQUEST_DELAY);
            } else {
                // Tried real and (if available) alternate title, now try
                // algorithms more prone to an incorrect match.

                // Titles like "2001: A Space Odyssey" are correctly resolved,
                // but titles like "Blade Runner: The Final Cut" are not.
                // Give those that fail another chance; try it without the ":".
                // But try only once, to avoid incorrect matches, e.g. for
                // Lisa Lampanelli: Dirty Girl: No Protection.
                var idx = detail.title.lastIndexOf(':');   // Use Netflix title.
                if (ALGO_NETFLIX_TITLE_SUBSTRING !== titleAlgorithm &&
                            idx >= 0) {
                    success = false;

                    detail.imdb_title = detail.title.substring(0, idx);
                    delayed = function () { 
                        getImdbId(detail, ALGO_NETFLIX_TITLE_SUBSTRING);
                    };
                    timer = setTimeout(delayed, XHR_REQUEST_DELAY);
                } else {
                    // Could not resolve.  Keep IMDB data empty and continue.
                    detail.imdb_id = '';
                    detail.imdb_title = '';
                    detail.imdb_year = '';

                    // Treat as success, so that rating gets saved.
                    success = true;
                }
            }
        }

        if (success) {
            // Only output IMDB title if it's different from Netflix's.
            if (detail.title === detail.imdb_title) {
                delete(detail.imdb_title);
            }
            // Only output IMDB year if it's different from Netflix's.
            if (detail.year === detail.imdb_year) {
                delete(detail.imdb_year);
            }
            saveRating(detail);

            // Continue with more IMDB work.
            doImdbWork();
        }
    }



    // Return publicly accessible variables and functions.
    return {
        //
        // Public functions
        // (These access private variables and functions through "closure".)
        //

        // Initialize this script.
        init: function () {
            // Build the GUI for this script.
            buildGui();

            // Now wait for user to press Start button.
        }
    };
}());
// End singleton pattern.

// Run this script.
NetflixMovieRatingsExtractor.init();

///////////////////////////////////////////////////////////////////////////////

