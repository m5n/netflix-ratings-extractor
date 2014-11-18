///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Ratings Extractor
// Version 2.0, 2014-11-17
// Coded by Maarten van Egmond: https://github.com/m5n/
// Released under the MIT license.
//
// ==UserScript==
// @name           Netflix Ratings Extractor
// @namespace      http://userscripts.org/users/64961
// @author         Maarten
// @version        2.0
// @description    v2.0: Export your rated Netflix movies.
// @match *://*.netflix.ca/MoviesYouveSeen*
// @match *://*.netflix.nl/MoviesYouveSeen*
// @match *://*.netflix.com/MoviesYouveSeen*
// NinjaKit doesn't seem to support @match, so use @include
// @include htt*://*.netflix.ca/MoviesYouveSeen*
// @include htt*://*.netflix.nl/MoviesYouveSeen*
// @include htt*://*.netflix.com/MoviesYouveSeen*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see
// https://github.com/m5n/netflix-ratings-extractor
//
///////////////////////////////////////////////////////////////////////////////

// Satisfy JSLint.
/*global alert, document, setTimeout, window */

(function () {
    'use strict';

    var
        // Time to wait for additional movies to be added to the page.
        LAZY_LOAD_DELAY = 5000,

        // Current scroll height.
        scrollHeight = 0,

        // Total ratings processed.
        totalRatings = 0,

        // Did user stop the export early?
        stopped = false,

        // Time this script started doing work.
        startTime = 0;

    // Adds a message to the user-readable output area.
    function addOutput(msg) {
        var output = document.getElementById('script_output');

        output.value += msg + "\n";

        // Move cursor to the end of the output area.
        output.scrollTop = output.scrollHeight;
    }

    function saveRating(detail) {
        var result = '';

        result += detail.id + '\t';
        result += detail.title + '\t';
        result += detail.rating + '\t';
        result += detail.date;

        addOutput(result);
    }

    function captureStartState() {
        scrollHeight = 0;
        totalRatings = 0;
        stopped = false;
        startTime = (new Date()).getTime();

        // Write out column titles.
        saveRating({
            'id': 'ID',
            'title': 'Title',
            'rating': 'Rating',
            'date': 'Date'
        });
    }

    function captureEndState(forced) {
        // Inform the user about what happened.
        if (forced) {
            addOutput("Stopped.");
        } else {
            var endTime = (new Date()).getTime();

            addOutput("Done.\nExtracted " + totalRatings + " ratings in " +
                    Math.round((endTime - startTime) / 1000) + " seconds.");
        }
    }

    function parseRatings() {
        var rows = document.querySelectorAll('.retableRow'),
            detail,
            row,
            ii;

        totalRatings = rows.length;

        for (ii = 0; ii < totalRatings; ii += 1) {
            row = rows[ii];

            detail = {};
            detail.id = row.getAttribute('data-movieid');
            detail.title = row.querySelector('.title a').innerHTML;
            detail.rating = row.querySelector('.rating ' +
                    '.starbar').getAttribute('data-your-rating');
            detail.date = row.querySelector('.date').innerHTML;

            saveRating(detail);
        }

        captureEndState();
    }

    function go() {
        // Lazily load all movies by controlling the page scroll position.
        if (scrollHeight !== document.body.scrollHeight) {
            scrollHeight = document.body.scrollHeight;

            window.scrollTo(0, scrollHeight);

            if (!stopped) {
                // Wait until additional movies, if any, are added.
                setTimeout(go, LAZY_LOAD_DELAY);
                return;
            }
        }

        // All movies have been loaded. Back to the top and export ratings!
        window.scrollTo(0, 0);
        parseRatings();
    }

    // Event handler for the Start button.
    function startScript() {
        alert('The script will repeatedly scroll to the end of this page to ' +
                'load all your rated movies.\nOnce that\'s done, it\'ll jump ' +
                'back here and display the ratings in the area below.');

        captureStartState();
        go();
    }

    // Event handler for the Stop button.
    function stopScript() {
        stopped = true;
        captureEndState(true);
    }

    function showUi() {
        var container,
            pElt,
            gui,
            bStart,
            bStop,
            tOutput,
            span,
            content;

        container = document.createElement('div');
        container.setAttribute('style',
                'text-align: center; margin: 1em 0 1em; ' +
                'padding: 0 1em; border: 10px solid #b9090b;');

        pElt = document.createElement('p');
        pElt.appendChild(document.createTextNode(
            'Netflix Ratings Extractor v2.0'
        ));
        pElt.setAttribute('style', 'margin-top: 1em; font-size: smaller; ' +
                'font-weight: bold');
        container.appendChild(pElt);

        gui = document.createElement('div');

        // Create start button.
        bStart = document.createElement('button');
        bStart.setAttribute('style', 'font-size: smaller; margin: 0.5em; ' +
                'vertical-align: middle;');
        bStart.appendChild(document.createTextNode('Start'));
        bStart.addEventListener('click', startScript, true);

        // Create stop button.
        bStop = document.createElement('button');
        bStop.setAttribute('style', 'font-size: smaller; margin: 0.5em; ' +
                'vertical-align: middle;');
        bStop.appendChild(document.createTextNode('Stop'));
        bStop.addEventListener('click', stopScript, true);

        // Create output area.
        tOutput = document.createElement('textarea');
        tOutput.setAttribute('id', 'script_output');
        tOutput.setAttribute('style', 'font-size: smaller; width: 100%; ' +
                'height: 9em');

        gui.appendChild(bStart);
        gui.appendChild(bStop);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        span = document.createElement('span');
        span.setAttribute('style', 'font-size: smaller; float: left');
        span.appendChild(document.createTextNode(
            'Script output (columns are tab-separated):'
        ));
        gui.appendChild(span);

        gui.appendChild(tOutput);
        gui.appendChild(document.createElement('br'));
        gui.appendChild(document.createElement('br'));

        container.appendChild(gui);

        // Add UI to the page.
        content = document.getElementsByClassName('account-header');
        if (content && content.length) {
            content = content[0];
            content.insertBefore(container, content.childNodes[0]);
        } else {
            content = document.body;
            content.appendChild(container);
        }
    }

    return {
        init: function () {
            showUi();

            // Now wait for user to press the Start button.
        }
    };
}()).init();

///////////////////////////////////////////////////////////////////////////////

