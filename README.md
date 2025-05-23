# MHTCET College Preference List Generator

A web application built with FastAPI and modern web technologies to help MHTCET students generate personalized college preference lists with admission probability predictions.

## Features

- **Personalized Recommendations**: Get college suggestions based on your MHTCET rank and preferences
- **Admission Probability Calculation**: Advanced algorithm to calculate admission chances
- **Multiple Filter Options**: Filter by quota, category, seat type, and round
- **Interactive Results**: Sortable table with color-coded probability indicators
- **Excel Export**: Download your preferences as an Excel file
- **User Authentication**: Secure access through NextStep platform
- **Usage Tracking**: Fair usage limits with Firestore integration

## Technology Stack

- **Backend**: FastAPI (Python)
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Bootstrap 5
- **Charts**: Plotly.js
- **Authentication**: Firebase Auth
- **Database**: Firestore (for usage tracking)
- **Export**: SheetJS (XLSX)

## Input Parameters

### Required Fields
1. **Student Rank**: Your MHTCET rank
2. **Quota**: 
   - General
   - Ladies
   - PWD (Persons with Disability)
   - Defense
   - TFWS (Tuition Fee Waiver Scheme)
   - EWS (Economically Weaker Section)
   - Orphan
   - Minority
3. **Category**: Open, SC, ST, VJ, NT1, NT2, NT3, OBC, SEBC
4. **Seat Type**: 
   - State Level
   - Home University
   - Other than Home University
5. **Round**: 1, 2, or 3

### Optional Fields
- **Minimum Admission Probability**: Threshold filter (0-100%)

## Output Data

The results table displays:
- **Preference Number**: Auto-generated preference order
- **College Code**: Official college code
- **College Name**: Full college name
- **Branch Code**: Branch identification code
- **Branch Name**: Course/branch name
- **Category Code**: Internal category code
- **Cutoff Rank**: Previous year cutoff rank
- **Cutoff Percentile**: Cutoff percentile score
- **Admission Probability**: Calculated admission chance (%)
- **Admission Chances**: Text interpretation of probability

## Data Structure

### CSV Format
The app uses MHTCET cutoff data with the following structure:
```
Sr no, College code, College name, Branch code, Branch name, Category code, Quota, Category, Seat Type, Cutoff rank, Cutoff percentile, Round
```

### Probability Calculation Algorithm

The admission probability is calculated based on:
- Student rank vs. cutoff rank
- Relative position within the rank range
- Historical admission patterns

**Probability Ranges**:
- **95%**: Very High Chance (rank much better than cutoff)
- **85%**: High Chance (good margin above cutoff)
- **75%**: Decent margin
- **65%**: Close to cutoff
- **40%**: Very close but below cutoff
- **25%**: Close but below cutoff
- **10%**: Moderate gap
- **0%**: Large gap

## Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js (for development tools)
- Firebase project for authentication

### Backend Setup
1. Clone the repository
2. Install Python dependencies:
   ```bash
   pip install fastapi uvicorn pandas numpy plotly requests
   ```
3. Place the MHTCET_cutoff2024.csv file in the project root
4. Configure Firebase credentials in the JavaScript files
5. Run the application:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend Setup
The frontend uses CDN-based libraries, so no additional setup is required. All dependencies are loaded from CDNs:
- Bootstrap 5.3.0
- Font Awesome 6.4.0
- Plotly.js
- SheetJS
- FileSaver.js

## File Structure

```
├── app/
│   ├── main.py              # FastAPI application
│   ├── utils.py             # Data processing utilities
│   ├── templates/
│   │   └── index.html       # Main HTML template
│   └── static/
│       ├── css/
│       │   └── main.css     # Styling (reused from JOSAA app)
│       └── js/
│           ├── mhtcet-main.js          # Main JavaScript logic
│           ├── auth-verification.js     # Authentication
│           ├── usage-limiter.js         # Usage tracking
│           ├── firestore-usage-tracker.js # Firestore integration
│           └── hash-tracker.js          # Debug utility
├── MHTCET_cutoff2024.csv    # Cutoff data
└── README.md
```

## API Endpoints

### GET Endpoints
- `/` - Main application page
- `/api/health` - Health check
- `/api/quotas` - Get available quotas
- `/api/categories` - Get available categories
- `/api/seat-types` - Get available seat types
- `/api/rounds` - Get available rounds

### POST Endpoints
- `/api/predict` - Generate preference list

### Request Format
```json
{
    "student_rank": 12345,
    "quota": "General",
    "category": "Open",
    "seat_type": "State Level",
    "round_no": "1",
    "min_probability": 30.0
}
```

## Key Differences from JOSAA App

1. **Input Parameters**: MHTCET-specific quota, category, and seat type options
2. **Data Structure**: Different CSV column structure for MHTCET data
3. **Probability Algorithm**: Simplified calculation based on cutoff ranks only
4. **Display Fields**: MHTCET-specific output columns
5. **Rank Types**: Single MHTCET rank instead of JEE Main/Advanced distinction

## Authentication & Security

- Firebase-based authentication through NextStep platform
- Usage limiting (5 generations per day for regular users)
- Secure token validation
- CORS protection

## Usage Limits

- **Regular Users**: 5 preference generations per day
- **Unlimited Users**: Specified email addresses have unlimited access
- **Development Mode**: Simulated usage tracking

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For technical issues or feature requests, please contact the development team through the NextStep platform.

## Disclaimer

This tool provides suggestions based on previous year's cutoff data. The admission probabilities are estimates and actual results may vary. This is not an official MHTCET tool and should be used only for reference purposes.

## License

This project is proprietary software owned by NextStep Education Solutions.
