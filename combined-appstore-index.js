// Required dependencies
require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const xml2js = require('xml2js');
const readline = require('readline');
const fs = require('fs');

// Slack API setup
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackChannel = process.env.SLACK_CHANNEL;

async function sendToSlack(message) {
  try {
    const response = await axios.post('https://slack.com/api/chat.postMessage', {
      channel: slackChannel,
      text: message,
      mrkdwn: true
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${slackToken}`
      }
    });
    if (response.data.ok) {
      console.log(`Message sent to Slack channel (${slackChannel}) successfully.`);
    } else {
      console.error(`Failed to send message to Slack channel (${slackChannel}). Error:`, response.data.error);
    }
  } catch (error) {
    console.error('Error sending message to Slack:', error);
  }
}

if (!slackChannel || !slackToken) {
  console.error('Error: SLACK_CHANNEL or SLACK_BOT_TOKEN is not defined in the environment variables.');
  process.exit(1);
}

// Retrieve command line arguments
const args = process.argv.slice(2);
const storeArg = args.find(arg => arg.startsWith('--store='));
let modeArg = args.find(arg => arg.startsWith('--mode='));
const reviewsCountArg = args.find(arg => arg.startsWith('--reviews='));
const sendToSlackArg = args.find(arg => arg.startsWith('--sendToSlack='));
const ignoreLastRunArg = args.find(arg => arg.startsWith('--ignoreLastRun='));
const debugArg = args.find(arg => arg.startsWith('--debug='));

let storeChoice = storeArg ? storeArg.split('=')[1].toLowerCase() : null;
let reviewsCount = reviewsCountArg ? parseInt(reviewsCountArg.split('=')[1], 10) : null;
let isDebugMode = debugArg ? debugArg.split('=')[1].toLowerCase() === 'yes' : false;
let sendToSlackFlag = sendToSlackArg ? sendToSlackArg.split('=')[1].toLowerCase() === 'yes' : false;
let ignoreLastRunTimestamp = ignoreLastRunArg ? ignoreLastRunArg.split('=')[1].toLowerCase() === 'yes' : false;

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptIfNeeded() {
  if (!storeChoice || !modeArg || !reviewsCount || !sendToSlackArg || ignoreLastRunArg == null || debugArg == null) {
    rl.question('Which app store do you want to retrieve reviews from? (apple/google/both): ', (storeAnswer) => {
      storeChoice = storeAnswer.trim().toLowerCase();
      rl.question('Run in test mode or production mode? (test/prod): ', (modeAnswer) => {
        modeArg = modeAnswer.trim().toLowerCase();
        rl.question('How many of the latest reviews would you like to retrieve? ', (numReviews) => {
          reviewsCount = parseInt(numReviews, 10) || 1;
          rl.question('Do you want to ignore the last run timestamp and retrieve the latest reviews regardless? (yes/no): ', (ignoreAnswer) => {
            ignoreLastRunTimestamp = ignoreAnswer.trim().toLowerCase() === 'yes';
            rl.question(`Do you want to send the reviews to Slack? (yes/no) [Channel: ${slackChannel}] `, (sendToSlackAnswer) => {
              sendToSlackFlag = sendToSlackAnswer.trim().toLowerCase() === 'yes';
              rl.question('Enable debug mode? (yes/no): ', (debugAnswer) => {
                isDebugMode = debugAnswer.trim().toLowerCase() === 'yes';
                proceedWithReviewRetrieval();
              });
            });
          });
        });
      });
    });
  } else {
    proceedWithReviewRetrieval();
  }
}

function proceedWithReviewRetrieval() {
  const lastRunTimestamp = getLastRunTimestamp();
  if (storeChoice === 'apple') {
    getRecentAppleReviews(reviewsCount, lastRunTimestamp);
  } else if (storeChoice === 'google') {
    getGooglePlayReviews(reviewsCount, lastRunTimestamp);
  } else if (storeChoice === 'both') {
    getRecentAppleReviews(reviewsCount, lastRunTimestamp);
    getGooglePlayReviews(reviewsCount, lastRunTimestamp);
  } else {
    console.error('Invalid store choice. Please choose from apple, google, or both.');
  }
  if (rl) {
    rl.close();
  }
}

function getLastRunTimestamp() {
  if (ignoreLastRunTimestamp) {
    return 0;
  }
  try {
    const timestamp = fs.readFileSync('lastRunTimestamp.txt', 'utf8');
    return parseInt(timestamp, 10) || 0;
  } catch (err) {
    console.warn('No last run timestamp found, proceeding without filtering by timestamp.');
    return 0;
  }
}

function updateLastRunTimestamp() {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  fs.writeFileSync('lastRunTimestamp.txt', currentTimestamp.toString(), 'utf8');
}

// Function to fetch Apple Store reviews
async function getRecentAppleReviews(reviewsCount = null, lastRunTimestamp = 0) {
  try {
    const appleId = process.env.APPLE_ID;
    const url = `https://itunes.apple.com/rss/customerreviews/id=${appleId}/sortBy=mostRecent/xml`;
    const response = await axios.get(url);
    const xmlData = response.data;

    // Parse the XML data
    xml2js.parseString(xmlData, (err, result) => {
      if (err) {
        console.error('Error parsing XML:', err);
        return;
      }

      // Navigate through the parsed data to get the reviews
      const entries = result.feed.entry;
      if (!entries) {
        console.log('No reviews available.');
        return;
      }

      console.log(`=========================
App: iOS UTR Sports App\n=========================`);

      const sortedEntries = entries.sort((a, b) => new Date(b.updated[0]) - new Date(a.updated[0]));
      const reviewsToDisplay = sortedEntries.filter((entry) => {
        const reviewTimestamp = Math.floor(new Date(entry.updated[0]).getTime() / 1000);
        return reviewTimestamp > lastRunTimestamp;
      }).slice(0, reviewsCount || sortedEntries.length);

      if (reviewsToDisplay.length === 0) {
        console.log('No new reviews have occurred in the Apple App Store since the last run.');
      }

      reviewsToDisplay.forEach((entry) => {
        const reviewDate = DateTime.fromISO(entry.updated[0], { zone: 'America/Los_Angeles' }).toFormat('MMMM dd, yyyy, hh:mm a');
        const rating = entry['im:rating'][0];
        const reviewTitle = entry.title[0];
        const reviewText = entry.content[0]._;
        const authorName = entry.author[0].name[0];
        const country = entry['im:country'] ? entry['im:country'][0] : 'Unknown';
        const helpfulVotes = entry['im:voteCount'] ? entry['im:voteCount'][0] : '0';
        const totalHelpfulVotes = entry['im:voteSum'] ? entry['im:voteSum'][0] : '0';
        const reviewLink = entry.id && entry.id[0] ? entry.id[0] : 'N/A';
        const version = entry['im:version'][0];

        const message = `*iOS App Review:* v${version}
*Date:* ${reviewDate}
*Rating:* ${rating}/5
*Title:* ${reviewTitle}
*Detail:* ${reviewText}
- - - - - - - -
*by:* ${authorName}
*Country:* ${country}
*Helpful Votes:* ${helpfulVotes} (Total: ${totalHelpfulVotes})
*Review Link:* ${reviewLink}

=========================`;
        console.log(`
${message}`);
        if (sendToSlackFlag) {
          sendToSlack(message);
        }
      });
    });
  } catch (error) {
    console.error('Error fetching Apple reviews:', error);
  }
}

// Function to fetch Google Play Store reviews
async function getGooglePlayReviews(reviewsCount = null, lastRunTimestamp = 0) {
  try {
    // Authenticate using service account key
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_PLAY_JSON_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const androidPublisher = google.androidpublisher('v3');

    // Retrieve reviews
    const result = await androidPublisher.reviews.list({
      packageName: packageName,
    });

    const reviews = result.data.reviews;
    if (!reviews || reviews.length === 0) {
      console.log('No reviews available for Android app.');
      return;
    }

    console.log(`=========================
App: Android UTR Sports App\n=========================`);

    const sortedReviews = reviews.sort((a, b) => {
      const timeA = a.comments?.[0]?.userComment?.lastModified?.seconds || 0;
      const timeB = b.comments?.[0]?.userComment?.lastModified?.seconds || 0;
      return timeB - timeA;
    });
    const reviewsToDisplay = sortedReviews.filter((review) => {
      const lastModified = review.comments?.[0]?.userComment?.lastModified;
      const reviewTimestamp = lastModified ? lastModified.seconds : 0;
      return reviewTimestamp > lastRunTimestamp;
    }).slice(0, reviewsCount || sortedReviews.length);

    if (reviewsToDisplay.length === 0) {
      console.log('No new reviews have occurred in the Google Play Store since the last run.');
    }

    // Output each review
    reviewsToDisplay.forEach((review) => {
      const lastModified = review.comments?.[0]?.userComment?.lastModified;
      const reviewDate = lastModified ? DateTime.fromMillis((lastModified.seconds || 0) * 1000, { zone: 'America/Los_Angeles' }).toFormat('MMMM dd, yyyy, hh:mm a') : 'Unknown date';
      const rating = review.comments?.[0]?.userComment?.starRating || 'No rating';
      const reviewText = review.comments?.[0]?.userComment?.text || 'No review text';
      const authorName = review.authorName || 'Anonymous';
      const thumbsUpCount = review.comments?.[0]?.userComment?.thumbsUpCount || '0';
      const reviewId = review.reviewId;
      const reviewLink = `https://play.google.com/store/apps/details?id=${packageName}&reviewId=${reviewId}`;

      const message = `*Android App Review:*
*Date:* ${reviewDate}
*Rating:* ${rating}/5
*Detail:* ${reviewText}
- - - - - - - -
*by:* ${authorName}
*Thumbs Up:* ${thumbsUpCount}
*Review Link:* ${reviewLink}

=========================`;
      console.log(`
${message}`);
      if (sendToSlackFlag) {
        sendToSlack(message);
      }
    });
  } catch (error) {
    console.error('Error fetching Google Play reviews:', error);
  }
}

proceedWithReviewRetrieval();
updateLastRunTimestamp();


