// Constants and Configuration
const API_URL = window.location.origin;
const ENDPOINTS = {
    branches: '/api/branches',
    quotas: '/api/quotas',
    categories: '/api/categories',
    seatTypes: '/api/seat-types',
    rounds: '/api/rounds',
    predict: '/api/predict'
}

// Import the usage limiter module
let UsageLimiter;

// Function to load the UsageLimiter module
async function loadUsageLimiter() {
    try {
        const module = await import('./usage-limiter.js');
        UsageLimiter = module.default;
        console.log('Usage limiter module loaded successfully');
        return true;
    } catch (error) {
        console.error('Failed to load usage limiter module:', error);
        return false;
    }
}

// Error Handling
function showError(message) {
    const alertContainer = document.getElementById('error-alert-container');
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 5000);
}

// Utility Functions
function handleProbabilityChange(event) {
    document.getElementById('prob-value').textContent = event.target.value;
}

function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipInstances = tooltipTriggerList.map(function(tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// Clean up function for tooltips
window.addEventListener('beforeunload', function() {
    tooltipInstances.forEach(tooltip => tooltip.dispose());
});

// Global Variables
let currentResults = null;
let tooltipInstances = [];
let currentSortColumn = null;
let isAscending = true;

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    initializeEventListeners();
    initializeTooltips();
});

// Modified initializeApp function to integrate usage limiter
async function initializeApp() {
    try {
        // Load usage limiter module
        const limiterLoaded = await loadUsageLimiter();
        
        // Apply usage limiter to the generate button if loaded successfully
        if (limiterLoaded && UsageLimiter) {
            const generateButton = document.getElementById('generate-btn');
            UsageLimiter.applyToButton(generateButton, null);
            
            // Display remaining uses counter
            displayRemainingUses();
        }
        
        await Promise.all([
            populateDropdown('quota', ENDPOINTS.quotas),
            populateDropdown('category', ENDPOINTS.categories),
            populateDropdown('seat-type', ENDPOINTS.seatTypes),
            populateDropdown('round-no', ENDPOINTS.rounds)
        ]);
    } catch (error) {
        showError('Failed to initialize application. Please refresh the page.');
        console.error('Initialization error:', error);
    }
}

// Function to display remaining uses
window.displayRemainingUses = async function() {
    if (!UsageLimiter || !window.AuthVerification || !window.AuthVerification.isAuthenticated()) {
        return;
    }
    
    try {
        const remainingUses = await UsageLimiter.getRemainingUses();
        
        // Create or update the counter element
        let counterElem = document.getElementById('remaining-uses-counter');
        if (!counterElem) {
            counterElem = document.createElement('div');
            counterElem.id = 'remaining-uses-counter';
            counterElem.className = 'text-muted small mt-2';
            
            // Add it near the generate button
            const buttonRow = document.querySelector('.button-row');
            if (buttonRow) {
                buttonRow.appendChild(counterElem);
            }
        }
        
        // Update the text
        if (remainingUses === Infinity) {
            counterElem.textContent = 'You have unlimited preference generations';
            counterElem.className = 'text-success small mt-2';
        } else {
            counterElem.textContent = `You have ${remainingUses} preference generations remaining today`;
            counterElem.className = `text-${remainingUses > 2 ? 'muted' : 'warning'} small mt-2`;
        }
    } catch (error) {
        console.error('Error displaying remaining uses:', error);
    }
}

// Dropdown Population
async function populateDropdown(elementId, endpoint) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        const select = document.getElementById(elementId);
        select.innerHTML = '<option value="">Select option</option>';
        
        // Handle different possible API response structures
        let options = [];
        if (Array.isArray(data)) {
            options = data;
        } else if (typeof data === 'object') {
            // If data is an object, get the first property's array value
            const firstKey = Object.keys(data)[0];
            if (Array.isArray(data[firstKey])) {
                options = data[firstKey];
            } else {
                // If the structure is different, try to extract options from the response
                options = Object.values(data).find(val => Array.isArray(val)) || [];
            }
        }
        
        options.forEach(option => {
            const optElement = document.createElement('option');
            optElement.value = option;
            optElement.textContent = option;
            select.appendChild(optElement);
        });
    } catch (error) {
        console.error(`Error populating ${elementId}:`, error);
        throw error;
    }
}

// Event Listeners
function initializeEventListeners() {
    // Form submission
    document.getElementById('preference-form').addEventListener('submit', handleFormSubmit);
    
    // Probability slider
    document.getElementById('min-prob').addEventListener('input', handleProbabilityChange);
    
    // Download button
    document.getElementById('download-btn').addEventListener('click', handleDownload);
    
    // Initialize table header click events for sorting
    initializeTableSorting();
}

// Initialize table sorting
function initializeTableSorting() {
    const resultsTable = document.getElementById('results-table');
    const headerRow = resultsTable.querySelector('thead tr');
    
    if (headerRow) {
        const headerCells = headerRow.querySelectorAll('th');
        headerCells.forEach((cell, columnIndex) => {
            cell.addEventListener('click', () => handleSortClick(columnIndex));
            cell.style.cursor = 'pointer';
            // Add sort indicator elements
            const sortIndicator = document.createElement('span');
            sortIndicator.className = 'sort-indicator ms-1';
            sortIndicator.innerHTML = '⇅';
            cell.appendChild(sortIndicator);
        });
    }
}

// Handle sort click
function handleSortClick(columnIndex) {
    if (currentResults && currentResults.length > 0) {
        // Toggle sort direction if clicking the same column
        if (currentSortColumn === columnIndex) {
            isAscending = !isAscending;
        } else {
            currentSortColumn = columnIndex;
            isAscending = true;
        }
        
        sortTable(columnIndex, isAscending);
        updateSortIndicators(columnIndex, isAscending);
    }
}

// Sort table by column
function sortTable(columnIndex, ascending) {
    if (!currentResults || currentResults.length === 0) return;
    
    const columnKeys = Object.keys(currentResults[0]);
    const columnKey = columnKeys[columnIndex];
    
    currentResults.sort((a, b) => {
        let valueA = a[columnKey];
        let valueB = b[columnKey];
        
        // Check if values are numeric
        const isNumeric = !isNaN(parseFloat(valueA)) && !isNaN(parseFloat(valueB));
        
        if (isNumeric) {
            valueA = parseFloat(valueA);
            valueB = parseFloat(valueB);
        } else {
            valueA = String(valueA).toLowerCase();
            valueB = String(valueB).toLowerCase();
        }
        
        if (valueA < valueB) return ascending ? -1 : 1;
        if (valueA > valueB) return ascending ? 1 : -1;
        return 0;
    });
    
    // Redisplay sorted results
    const tableBody = document.getElementById('results-body');
    tableBody.innerHTML = '';
    
    currentResults.forEach(pref => {
        const row = tableBody.insertRow();
        Object.values(pref).forEach(value => {
            const cell = row.insertCell();
            cell.textContent = value;
        });
    });
}

// Update sort indicators in the table header
function updateSortIndicators(activeColumnIndex, ascending) {
    const headerCells = document.querySelectorAll('#results-table thead th');
    
    headerCells.forEach((cell, index) => {
        const indicator = cell.querySelector('.sort-indicator');
        if (index === activeColumnIndex) {
            indicator.innerHTML = ascending ? '↑' : '↓';
            indicator.classList.add('active');
        } else {
            indicator.innerHTML = '⇅';
            indicator.classList.remove('active');
        }
    });
}

async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!validateForm()) return false;
    
    const formData = {
        student_rank: parseInt(document.getElementById('student-rank').value),
        quota: document.getElementById('quota').value,
        category: document.getElementById('category').value,
        seat_type: document.getElementById('seat-type').value,
        round_no: document.getElementById('round-no').value,
        min_probability: parseFloat(document.getElementById('min-prob').value)
    };

    try {
        setLoadingState(true);
        
        const response = await fetch(`${API_URL}${ENDPOINTS.predict}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        handlePredictionResponse(data);
        
        // Update the usage count after successful generation
        if (UsageLimiter) {
            await UsageLimiter.checkAndUpdateUsage(true);
            // Update the display
            await displayRemainingUses();
        }
        
        return true; // Indicate success
    } catch (error) {
        showError('Failed to generate preferences. Please try again.');
        console.error('Prediction error:', error);
        return false; // Indicate failure
    } finally {
        setLoadingState(false);
    }
}

// Response Handler
function handlePredictionResponse(data) {
    if (!data.preferences || data.preferences.length === 0) {
        showError('No colleges found matching your criteria.');
        return;
    }

    currentResults = data.preferences;
    displayResults(data);
    document.getElementById('download-btn').disabled = false;
    
    // Reset sorting state when new results are displayed
    currentSortColumn = null;
    isAscending = true;
    updateSortIndicators(-1, true);
}

// Results Display
function displayResults(data) {
    const outputSection = document.getElementById('output-section');
    const tableBody = document.getElementById('results-body');
    
    // Clear previous results
    tableBody.innerHTML = '';
    
    // Populate table
    data.preferences.forEach(pref => {
        const row = tableBody.insertRow();
        
        // Determine row color based on probability
        const probability = parseFloat(pref['Admission Probability (%)']);
        if (probability >= 80) {
            row.classList.add('table-success');
        } else if (probability >= 50) {
            row.classList.add('table-warning');
        } else if (probability > 0) {
            row.classList.add('table-danger');
        }
        
        // Add data in the correct order matching the table headers
        const headers = [
            'Preference',
            'College code',
            'College name',
            'Branch code',
            'Branch name',
            'Category code',
            'Cutoff rank',
            'Cutoff percentile',
            'Admission Probability (%)',
            'Admission Chances'
        ];
        
        headers.forEach(header => {
            const cell = row.insertCell();
            // Handle missing columns gracefully
            cell.textContent = pref[header] || '';
        });
    });

    // Create plot if data available
    if (data.plot_data) {
        createPlot(data.plot_data);
    }

    outputSection.style.display = 'block';
    outputSection.scrollIntoView({ behavior: 'smooth' });
}

// Plot Creation
function createPlot(plotData) {
    const layout = {
        title: 'Distribution of Admission Probabilities',
        xaxis: {
            title: 'Admission Probability (%)',
            gridcolor: '#f0f0f0'
        },
        yaxis: {
            title: 'Number of Colleges',
            gridcolor: '#f0f0f0'
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        showlegend: false
    };

    Plotly.newPlot('plot-container', [plotData], layout, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    });
}

// Download Handler
function handleDownload() {
    if (!currentResults || currentResults.length === 0) {
        showError('No data available to download');
        return;
    }

    try {
        const worksheet = XLSX.utils.json_to_sheet(currentResults);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'MHTCET Preferences');
        
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        saveAs(blob, `MHTCET_Preferences_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
        showError('Failed to download Excel file');
        console.error('Download error:', error);
    }
}

// Form Validation
function validateForm() {
    const form = document.getElementById('preference-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return false;
    }
    return true;
}

// UI State Management
function setLoadingState(isLoading) {
    const generateBtn = document.getElementById('generate-btn');
    const downloadBtn = document.getElementById('download-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Check if generateBtn exists before proceeding
    if (!generateBtn) {
        console.warn('Generate button not found');
        return;
    }
    
    // Add null checks for all elements
    const spinner = generateBtn.querySelector('.spinner-border');
    const buttonContent = generateBtn.querySelector('.button-content');

    if (isLoading) {
        // Disable buttons
        if (generateBtn) generateBtn.disabled = true;
        if (downloadBtn) downloadBtn.disabled = true;
        
        // Show loading overlay
        if (loadingOverlay) loadingOverlay.classList.remove('d-none');
        
        // Update button UI
        if (spinner) spinner.classList.remove('d-none');
        if (buttonContent) buttonContent.classList.add('d-none');
    } else {
        // Re-enable buttons
        if (generateBtn) generateBtn.disabled = false;
        
        // Hide loading overlay
        if (loadingOverlay) loadingOverlay.classList.add('d-none');
        
        // Restore button UI
        if (spinner) spinner.classList.add('d-none');
        if (buttonContent) buttonContent.classList.remove('d-none');
    }
}
