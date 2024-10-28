require('dotenv').config();
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const { DateTime } = require('luxon');

// Slack API setup
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackChannel = process.env.SLACK_CHANNEL;

if (!slackChannel || !slackToken) {
  console.error('Error: SLACK_CHANNEL or SLACK_BOT_TOKEN is not defined in the environment variables.');
  process.exit(1);
}

// Retrieve command line arguments
const args = process.argv.slice(2);
const modeArg = args.find(arg => arg.startsWith('--mode='));
const reviewsCountArg = args.find(arg => arg.startsWith('--reviews='));
const sendToSlackArg = args.find(arg => arg.startsWith('--sendToSlack='));
const storeArg = args.find(arg => arg.startsWith('--store='));
const ignoreLastRunArg = args.find(arg => arg.startsWith('--ignoreLastRun='));
const debugArg = args.find(arg => arg.startsWith('--debug='));

// Set values based on command line arguments or prompt the user if missing
const mode = modeArg ? modeArg.split('=')[1].toLowerCase() : null;
const isTestMode = mode === 'test';
let reviewsCount = reviewsCountArg ? parseInt(reviewsCountArg.split('=')[1], 10) : null;
let sendToSlackFlag = sendToSlackArg ? sendToSlackArg.split('=')[1].toLowerCase() === 'yes' : null;
let ignoreLastRunTimestamp = ignoreLastRunArg ? ignoreLastRunArg.split('=')[1].toLowerCase() === 'yes' : false;
let storeChoice = storeArg ? storeArg.split('=')[1].toLowerCase() : null;
const isDebugMode = debugArg ? debugArg.split('=')[1].toLowerCase() === 'yes' : false;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptIfNeeded() {
  if (!mode) {
    rl.question('Run in test mode or production mode? (test/prod): ', (answer) => {
      const modeInput = answer.trim().toLowerCase();
      runApp(modeInput);
    });
  } else {
    runApp(mode);
  }
}

function runApp(modeInput) {
  storeChoicePrompt(modeInput);
}

function storeChoicePrompt(modeInput) {
  if (!storeChoice) {
    rl.question('Which app store do you want to retrieve reviews from? (apple/google/both): ', (storeAnswer) => {
      storeChoice = storeAnswer.trim().toLowerCase();
      reviewsCountPrompt();
    });
  } else {
    reviewsCountPrompt();
  }
}

function reviewsCountPrompt() {
  if (!reviewsCount) {
    rl.question('How many of the latest reviews would you like to retrieve? ', (numReviews) => {
      reviewsCount = parseInt(numReviews, 10) || 1;
      ignoreLastRunTimestampPrompt();
    });
  } else {
    ignoreLastRunTimestampPrompt();
  }
}

function ignoreLastRunTimestampPrompt() {
  if (ignoreLastRunArg == null) {
    rl.question('Do you want to ignore the last run timestamp and retrieve the latest reviews regardless? (yes/no): ', (ignoreAnswer) => {
      ignoreLastRunTimestamp = ignoreAnswer.trim().toLowerCase() === 'yes';
      sendToSlackPrompt();
    });
  } else {
    sendToSlackPrompt();
  }
}

function sendToSlackPrompt() {
  if (sendToSlackFlag == null) {
    rl.question(`Do you want to send the reviews to Slack? (yes/no) [Channel: ${slackChannel}] `, (sendToSlackAnswer) => {
      sendToSlackFlag = sendToSlackAnswer.trim().toLowerCase() === 'yes';
      proceedWithReviewRetrieval();
    });
  } else {
    proceedWithReviewRetrieval();
  }
}

function proceedWithReviewRetrieval() {
  getReviewsBasedOnStoreChoice();
  rl.close();
}

function getReviewsBasedOnStoreChoice() {
  if (storeChoice === 'apple') {
    getRecentReviews(reviewsCount, sendToSlackFlag);
  } else if (storeChoice === 'google') {
    getGooglePlayReviews(reviewsCount, sendToSlackFlag);
  } else if (storeChoice === 'both') {
    getRecentReviews(reviewsCount, sendToSlackFlag);
    getGooglePlayReviews(reviewsCount, sendToSlackFlag);
  } else {
    console.error('Invalid store choice. Please choose from apple, google, or both.');
  }
}

// Function to get recent reviews from Apple Store
async function getRecentReviews(reviewsCount = null, sendToSlackFlag = false) {
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

      console.log(`App: iOS UTR Sports App\n=========================`);

      let reviewsToDisplay;
      if (isTestMode && reviewsCount) {
        reviewsToDisplay = entries.slice(0, reviewsCount); // Only the specified number of latest reviews in test mode
      } else if (ignoreLastRunTimestamp) {
        reviewsToDisplay = entries.slice(0, reviewsCount || entries.length); // Retrieve specified number or all reviews ignoring last run timestamp
      } else {
        const lastRunTimestamp = getLastRunTimestamp();
        reviewsToDisplay = entries.filter((entry) => {
          const reviewDate = new Date(entry.updated[0]);
          return reviewDate > lastRunTimestamp;
        });
      }

      if (reviewsToDisplay.length === 0) {
        console.log('No new reviews since the last run.');
      } else {
        reviewsToDisplay.forEach((entry) => {
          const reviewDate = DateTime.fromISO(entry.updated[0], { zone: 'America/Los_Angeles' }).toFormat('MMMM dd, yyyy, hh:mm a');
          const helpfulVotes = entry['im:voteCount'] ? entry['im:voteCount'][0] : '0';
          const totalHelpfulVotes = entry['im:voteSum'] ? entry['im:voteSum'][0] : '0';
          const reviewLink = entry.id && entry.id[0] ? entry.id[0] : 'N/A';
          const country = entry['im:country'] ? entry['im:country'][0] : 'Unknown';

          const message = `*iOS App Review:* v${entry['im:version'][0]}
*Date:* ${reviewDate}
*Rating:* ${entry['im:rating'][0]}/5
*Title:* ${entry.title[0]}
*Detail:* ${entry.content[0]._}
- - - - - - - -
*by:* ${entry.author[0].name[0]}
*Country:* ${country}
*Helpful Votes:* ${helpfulVotes} (Total: ${totalHelpfulVotes})
*Review Link:* ${reviewLink}\n\n=========================`;

          console.log(`\n${message}`);
          if (sendToSlackFlag) {
            sendToSlackMessage(message).then(() => saveCurrentTimestamp()); // Send the review to Slack
          }
          
          if (isDebugMode) {
            console.log('Full Review Object:', JSON.stringify(entry, null, 2));
          }
        });
        // Save the current timestamp only after successfully processing reviews
        saveCurrentTimestamp();
      }
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
  }
}

// Function to fetch Google Play Store reviews
async function getGooglePlayReviews(reviewsCount = null, sendToSlackFlag = false) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_PLAY_JSON_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    const androidPublisher = google.androidpublisher('v3');

    const result = await androidPublisher.reviews.list({
      packageName: packageName,
    });

    const reviews = result.data.reviews;
    if (!reviews || reviews.length === 0) {
      console.log('No reviews available for Android app.');
      return;
    }

    console.log(`App: Android UTR Sports App\n=========================`);

    const lastRunTimestamp = getLastRunTimestamp();
    const reviewsToDisplay = reviews.filter((review) => {
      const reviewDate = review.lastModified ? new Date(review.lastModified.seconds * 1000) : new Date();
      return ignoreLastRunTimestamp || reviewDate > lastRunTimestamp;
    }).slice(0, reviewsCount || reviews.length);

    reviewsToDisplay.forEach((review) => {
      const reviewDate = review.lastModified ? DateTime.fromMillis(review.lastModified.seconds * 1000, { zone: 'America/Los_Angeles' }).toFormat('MMMM dd, yyyy, hh:mm a') : 'Unknown date';
      const helpfulVotes = review.comments[0].userComment.helpfulnessScore ? review.comments[0].userComment.helpfulnessScore : '0';

      const message = `*Android App Review:* (Package: ${packageName})
*Date:* ${reviewDate}
*Rating:* ${review.comments[0].userComment.starRating}/5
*Detail:* ${review.comments[0].userComment.text}
- - - - - - - -
*by:* ${review.authorName}
*Helpful Votes:* ${helpfulVotes}\n\n=========================`;

      console.log(`\n${message}`);
      if (sendToSlackFlag) {
        sendToSlackMessage(message).then(() => saveCurrentTimestamp()); // Send the review to Slack
      }

      if (isDebugMode) {
        console.log('Full Review Object:', JSON.stringify(review, null, 2));
      }
    });

    // Save the current timestamp only after successfully processing reviews
    saveCurrentTimestamp();
  } catch (error) {
    console.error('Error fetching Google Play reviews:', error);
  }
}

// Function to send message to Slack
async function sendToSlackMessage(message) {
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
      console.log(`Failed to send message to Slack channel (${slackChannel}). Error:`, response.data.error);
    }
  } catch (error) {
    console.error('Error sending message to Slack:', error);
  }
}

// Function to get the last run timestamp from the file
const lastRunFilePath = path.join(__dirname, 'lastRunTimestamp.txt');
function getLastRunTimestamp() {
  try {
    if (fs.existsSync(lastRunFilePath)) {
      const data = fs.readFileSync(lastRunFilePath, 'utf-8');
      const lastRunDate = new Date(data);
      if (!isNaN(lastRunDate)) {
        return lastRunDate;
      } else {
        console.warn('Invalid last run timestamp, using current time as fallback.');
        saveCurrentTimestamp(); // Save the current time to the file to avoid repeated errors
        return new Date();
      }
    }
  } catch (err) {
    console.error('Error reading last run timestamp:', err);
  }
  return new Date(); // If no valid timestamp, use current time as fallback
}

// Function to save the current timestamp to the file
function saveCurrentTimestamp() {
  try {
    const now = new Date().toISOString();
    fs.writeFileSync(lastRunFilePath, now, 'utf-8');
  } catch (err) {
    console.error('Error saving current timestamp:', err);
  }
}

// Run the app
promptIfNeeded();

