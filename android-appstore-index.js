// Required dependencies
require('dotenv').config();
const axios = require('axios');
const { google } = require('googleapis');
const { DateTime } = require('luxon');

// Google Play Store API setup
const reviewsCountArg = process.argv.slice(2).find(arg => arg.startsWith('--reviews='));
let reviewsCount = reviewsCountArg ? parseInt(reviewsCountArg.split('=')[1], 10) : null;
const debugArg = process.argv.slice(2).find(arg => arg.startsWith('--debug='));
const isDebugMode = debugArg ? debugArg.split('=')[1].toLowerCase() === 'yes' : false;

// Function to fetch Google Play Store reviews
async function getGooglePlayReviews(reviewsCount = null) {
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

    console.log(`App: Android UTR Sports App\n=========================`);

    const reviewsToDisplay = reviews.slice(0, reviewsCount || reviews.length);

    // Output each review
    reviewsToDisplay.forEach((review) => {
      const reviewDate = review.lastModified ? DateTime.fromMillis(review.lastModified.seconds * 1000, { zone: 'America/Los_Angeles' }).toFormat('MMMM dd, yyyy, hh:mm a') : null;
      const rating = review.comments?.[0]?.userComment?.starRating || null;
      const reviewText = review.comments?.[0]?.userComment?.text || 'No review text';
      const authorName = review.authorName || 'Anonymous';
      const thumbsUpCount = review.comments?.[0]?.userComment?.thumbsUpCount || '0';
      const thumbsDownCount = review.comments?.[0]?.userComment?.thumbsDownCount || '0';
      const reviewerLanguage = review.comments?.[0]?.userComment?.reviewerLanguage || null;
      const device = review.comments?.[0]?.userComment?.device || null;
      const androidOsVersion = review.comments?.[0]?.userComment?.androidOsVersion || null;
      const appVersionName = review.comments?.[0]?.userComment?.appVersionName || null;
      const deviceMetadata = review.comments?.[0]?.userComment?.deviceMetadata;
      const productName = deviceMetadata?.productName || null;
      const manufacturer = deviceMetadata?.manufacturer || null;
      const screenDensityDpi = deviceMetadata?.screenDensityDpi || null;
      const reviewId = review.reviewId || null;

      // Build message string with only available details
      let message = `*Android App Review:*`;
      if (appVersionName) message += `  v${appVersionName}`;
      message += `\n`;
      if (reviewDate) message += `*Date:* ${reviewDate}\n`;
      if (rating) message += `*Rating:* ${rating}/5\n`;
      message += `*Detail:* ${reviewText}\n- - - - - - - -\n*by:* ${authorName}\n`;
      if (thumbsUpCount || thumbsDownCount) message += `*Thumbs Up:* ${thumbsUpCount} | *Thumbs Down:* ${thumbsDownCount}\n`;
      if (reviewerLanguage) message += `*Language:* ${reviewerLanguage}\n`;
      if (device) message += `*Device:* ${device}\n`;
      if (androidOsVersion) message += `*Android OS Version:* ${androidOsVersion}\n`;
      if (productName) message += `*Product Name:* ${productName}\n`;
      if (manufacturer) message += `*Manufacturer:* ${manufacturer}\n`;
      if (screenDensityDpi) message += `*Screen Density DPI:* ${screenDensityDpi}\n`;
      if (reviewId) message += `*Review ID:* ${reviewId}\n`;
      if (reviewId) message += `*Link to Review:* https://play.google.com/store/apps/details?id=${packageName}&reviewId=${reviewId}\n`;

      message += `\n=========================`;
      console.log(`\n${message}`);
    });

    // If in debug mode, show all attributes for each review
    if (isDebugMode) {
      console.log('\nDEBUG MODE: FULL REVIEW DETAILS\n================================');
      reviewsToDisplay.forEach((review, index) => {
        console.log(`\nReview #${index + 1}:`);
        console.log(JSON.stringify(review, null, 2));
      });
    }
  } catch (error) {
    console.error('Error fetching Google Play reviews:', error);
  }
}

// Execute function
getGooglePlayReviews(reviewsCount);


