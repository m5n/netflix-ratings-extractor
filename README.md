Netflix Ratings Extractor
=========================

Greasemonkey script for Chrome, Firefox, Safari: export your rated Netflix movies.


Main UI:
<p align="center">
<img src="https://raw.githubusercontent.com/m5n/netflix-ratings-extractor/master/img/ui.png" alt="Netflix Ratings Extractor UI"/>
</p>


Installation instructions
-------------------------

* Chrome:
    * Note: [Starting in Chrome 21, it is more difficult to install extensions, apps, and user scripts from outside the Chrome Web Store](http://support.google.com/chrome_webstore/?p=crx_warning). Here's how to install the script:
    * (No add-on or extension installation required.)
    * Right-click on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-ratings-extractor/master/netflix-ratings-extractor.user.js) and select `Save Link As...` to save the script to a directory of your choice.
    * From the application menu, select `Tools > Extensions`.
    * Locate the script file on your computer and drag the file onto the Extensions page.
    * Click `Install`.
    * Manage your scripts via the `Window --> Tools -->Extensions` menu.


* Firefox:
  * Install the [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/748) add-on.
  * Restart Firefox.
  * Install this script by clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-ratings-extractor/master/netflix-ratings-extractor.user.js).
  * Manage your scripts via the `Tools-->Greasemonkey-->Manage User Scripts...` menu.


* Opera:
  * [Configure Opera](http://www.techerator.com/2011/02/how-to-add-greasemoney-and-other-scripts-to-opera-11/) to allow Greasemonkey scripts to be run.
  * Install this script by right-clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-ratings-extractor/master/netflix-ratings-extractor.user.js) and selecting the `Save Linked Content As...` option. Save the script to the directory you configured in the previous step, but rename it to "NetflixRatingsExtractor.user.js" so you can identify it later.
  * Restart Opera.
  * Manage your scripts directly in the directory you configured above.


* Safari:
  * Install the [NinjaKit](http://www.reddit.com/r/apple/comments/dd2sk/ninjakit_greasemonkey_for_safari/) extension.
  * Restart Safari.
  * Install this script by clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-ratings-extractor/master/netflix-ratings-extractor.user.js).
  * Manage your scripts via the NinjaKit toolbar icon or via the Extensions preferences.


Usage instructions
------------------
1. Restart Chrome/Firefox/Safari; the script will consume lots of memory, so don't use the browser while this script runs.
1. Go to Netflix and log in.
1. Navigate to the `Taste Profile -> What You've Rated` menu.
1. At to top of your ratings page find the start/stop buttons and results area.
1. Select the options you want and click the start button. (If you don't select all ratings, make sure to sort by rating first.)
1.  When the script finishes, you can copy the data in the results area to somewhere else (e.g. into a spreadsheet) for further processing. The first row has the column titles. Columns are tab-separated.

A Netflix movie URL can be reconstructed like so: `http://www.netflix.com/Movie/<netflix_id>/`


Known issues
------------
* The Netflix total ratings count may be wrong. In my case, Netflix reports a total of 1266 ratings, but there are only 1265 movies rated. (You can check this by navigating to the last page, and counting the number of ratings on it. In my case, the last page is 64, and there are only 5 ratings on it. That's 64 * 20 + 5 = 1265.) Nothing can be done about this; this is a bug on Netflix's side.
* This script consumes a lot of memory and is CPU intensive, and it is recommended to let it run without doing anything else.
* Also, it's slow. For me, I've seen Firefox grow to 539MB, taking over 30 minutes to output 1265 ratings.


History
-------

https://github.com/m5n/netflix-ratings-extractor/commits/master/netflix-ratings-extractor.user.js


Acknowledgments
---------------
This script is based on [Anthony Lieuallen's "getFlix Revamped"](http://web.arantius.com/getflix-revamped), which is based on [Devanshu Mehta's "getFlix" scripts](http://www.scienceaddiction.com/2006/03/03/fetch-your-netflix-ratings/), which in turn are based on [scripts by John Resig](http://ejohn.org/projects/netflix). I completely rewrote Anthony's script for version 1.0 of my script, but I learned the Greasemonkey ropes by studying his script.

Needless to say I'm standing on the shoulders of giants. 
