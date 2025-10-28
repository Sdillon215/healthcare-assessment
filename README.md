# Healthcare Assessment - Patient Risk Scoring System

A comprehensive TypeScript application that integrates with a healthcare API to fetch patient data, calculate risk scores, and generate alert lists for high-risk patients, fever cases, and data quality issues.

## Features

- **API Integration**: Robust handling of rate limiting, server errors, and pagination
- **Risk Scoring**: Comprehensive blood pressure, temperature, and age risk calculations
- **Data Validation**: Handles inconsistent API responses and missing data
- **Alert Generation**: Identifies high-risk patients, fever cases, and data quality issues
- **Assessment Submission**: Automated submission to healthcare assessment API

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd healthcare-assessment
```

2. Install dependencies:
```bash
npm install
```

## Configuration

The application uses the following configuration:

- **API Key**: Automatically configured for the assessment
- **Base URL**: `https://assessment.ksensetech.com/api/patients`
- **Rate Limiting**: 2-second delays between requests
- **Retry Logic**: Exponential backoff for server errors

## Usage

### Run the Application

```bash
npm start
```

This will:
1. Test the risk scoring logic with sample data
2. Fetch all patients from the API (~47 patients)
3. Calculate risk scores for each patient
4. Generate alert lists
5. Submit results to the assessment API

### Build the Application

```bash
npm run build
```

## Risk Scoring Criteria

### Blood Pressure Risk
- **Normal** (Systolic <120 AND Diastolic <80): 1 point
- **Elevated** (Systolic 120‑129 AND Diastolic <80): 2 points
- **Stage 1** (Systolic 130‑139 OR Diastolic 80‑89): 3 points
- **Stage 2** (Systolic ≥140 OR Diastolic ≥90): 4 points
- **Invalid/Missing Data**: 0 points

### Temperature Risk
- **Normal** (≤99.5°F): 0 points
- **Low Fever** (99.6-100.9°F): 1 point
- **High Fever** (≥101.0°F): 2 points
- **Invalid/Missing Data**: 0 points

### Age Risk
- **Under 40**: 1 point
- **40-65**: 1 point
- **Over 65**: 2 points
- **Invalid/Missing Data**: 0 points

### Total Risk Score
Total Risk = Blood Pressure Score + Temperature Score + Age Score

## Alert Lists Generated

1. **High-Risk Patients**: Patients with total risk score ≥ 4
2. **Fever Patients**: Patients with temperature ≥ 99.6°F
3. **Data Quality Issues**: Patients with invalid or missing data

## API Error Handling

The application handles various API challenges:

- **Rate Limiting (429)**: Automatic retry with 2-second delay
- **Server Errors (500/503)**: Exponential backoff retry (1s, 2s, 4s, 8s, 16s)
- **Invalid Responses**: Graceful error handling and continuation
- **Pagination**: Robust handling of multiple pages

## Project Structure

```
healthcare-assessment/
├── index.ts              # Main application file
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Dependencies

- **axios**: HTTP client for API requests
- **tsx**: TypeScript execution environment
- **@types/node**: Node.js type definitions
- **typescript**: TypeScript compiler

## Assessment Results

The application achieved a **63% score** in the healthcare assessment with:
- **Perfect fever detection** (9/9 patients)
- **Perfect high-risk detection** of correct patients (20/20)
- **Improved data quality detection** (5/8 patients)

## Troubleshooting

### Common Issues

1. **Rate Limiting**: The API may rate limit requests. The application handles this automatically with delays.

2. **Network Errors**: Ensure stable internet connection for API requests.

3. **TypeScript Errors**: Run `npm install` to ensure all dependencies are installed.

### Debug Mode

To see detailed logging, the application includes comprehensive console output showing:
- Risk score calculations
- Patient data processing
- API request/response details
- Error handling information

## License

This project is part of a healthcare assessment evaluation.