# App Store Reviews Aggregator

A Node.js application for aggregating and managing app reviews from both the Apple App Store and Google Play Store. This project helps developers and product teams collect and analyze user feedback efficiently.

## Features
- Retrieve reviews from Apple and Google Play Store.
- Simple commands for Apple-only, Google-only, or combined review fetching.
- Unified output for easy analysis.

## Getting Started

### Prerequisites
- Node.js (version 14 or higher recommended)
- npm (Node Package Manager)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/reynoldharbin/appstore-reviews.git
   ```
2. Navigate to the project directory and install dependencies:
   ```sh
   cd appstore-reviews
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   APPLE_API_KEY=<your-apple-api-key>
   GOOGLE_API_KEY=<your-google-api-key>
   ```

### Usage

To retrieve reviews, run one of the following commands:

- **Apple App Store only**:
  ```sh
  node appstore-index.js
  ```
- **Google Play Store only**:
  ```sh
  node android-appstore-index.js
  ```
- **Combined Reviews**:
  ```sh
  node combined-appstore-index.js
  ```

### License
This project is licensed under the MIT License.

### Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
