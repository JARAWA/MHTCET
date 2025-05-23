import pandas as pd
import numpy as np
import plotly.express as px
import math
from pathlib import Path
from datetime import datetime
from typing import Tuple, List, Dict, Optional, Union
import requests
from io import StringIO

def load_data() -> Optional[pd.DataFrame]:
    """
    Load and preprocess the MHTCET cutoff data
    
    Returns:
        Optional[pd.DataFrame]: Preprocessed DataFrame or None if loading fails
    """
    try:
        # Try to load from local file first
        current_dir = Path(__file__).parent.parent
        csv_path = current_dir / "MHTCET_cutoff2024.csv"
        
        if csv_path.exists():
            df = pd.read_csv(csv_path)
        else:
            # Fallback to GitHub or other URL if needed
            raise FileNotFoundError("CSV file not found locally")
        
        # Preprocess the data
        df["Cutoff rank"] = pd.to_numeric(df["Cutoff rank"], errors="coerce").fillna(999999)
        df["Cutoff percentile"] = pd.to_numeric(df["Cutoff percentile"], errors="coerce").fillna(0)
        df["Round"] = df["Round"].astype(str)
        
        # Clean and standardize text columns
        text_columns = ["College name", "Branch name", "Quota", "Category", "Seat Type"]
        for col in text_columns:
            if col in df.columns:
                df[col] = df[col].astype(str).str.strip()
        
        return df
    except Exception as e:
        print(f"Error loading data: {str(e)}")
        return None

def get_unique_branches() -> List[str]:
    """
    Get list of unique branches from the dataset
    
    Returns:
        List[str]: List of unique branch names
    """
    try:
        df = load_data()
        if df is not None:
            branches = sorted(df["Branch name"].dropna().unique().tolist())
            return ["All"] + branches
        return ["All"]
    except Exception as e:
        print(f"Error getting branches: {str(e)}")
        return ["All"]

def validate_inputs(
    student_rank: int,
    quota: str,
    category: str,
    seat_type: str,
    round_no: str
) -> Tuple[bool, str]:
    """
    Validate user inputs
    
    Args:
        student_rank (int): Student's MHTCET rank
        quota (str): Quota type
        category (str): Category
        seat_type (str): Seat type
        round_no (str): Round number
    
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not student_rank or student_rank <= 0:
        return False, "Please enter a valid MHTCET rank (greater than 0)"
    if not quota:
        return False, "Please select a quota"
    if not category:
        return False, "Please select a category"
    if not seat_type:
        return False, "Please select a seat type"
    if not round_no:
        return False, "Please select a round"
    
    return True, ""

def calculate_admission_probability(student_rank: int, cutoff_rank: float) -> float:
    """
    Calculate admission probability based on student rank and cutoff rank
    
    Args:
        student_rank (int): Student's rank
        cutoff_rank (float): Cutoff rank for the college/branch
    
    Returns:
        float: Calculated probability percentage
    """
    try:
        if cutoff_rank == 999999 or cutoff_rank == 0:  # No cutoff data
            return 0.0
        
        if student_rank <= cutoff_rank:
            # Student rank is better than or equal to cutoff
            rank_difference = cutoff_rank - student_rank
            if rank_difference >= cutoff_rank * 0.5:  # Much better rank
                return 95.0
            elif rank_difference >= cutoff_rank * 0.3:  # Good margin
                return 85.0
            elif rank_difference >= cutoff_rank * 0.1:  # Decent margin
                return 75.0
            else:  # Close to cutoff
                return 65.0
        else:
            # Student rank is worse than cutoff
            rank_difference = student_rank - cutoff_rank
            if rank_difference <= cutoff_rank * 0.05:  # Very close
                return 40.0
            elif rank_difference <= cutoff_rank * 0.1:  # Close
                return 25.0
            elif rank_difference <= cutoff_rank * 0.2:  # Moderate gap
                return 10.0
            else:  # Large gap
                return 0.0
                
    except Exception as e:
        print(f"Error in probability calculation: {str(e)}")
        return 0.0

def get_probability_interpretation(probability: float) -> str:
    """
    Convert probability percentage to text interpretation
    
    Args:
        probability (float): Probability value
    
    Returns:
        str: Interpretation text
    """
    if probability >= 80:
        return "Very High Chance"
    elif probability >= 60:
        return "High Chance"
    elif probability >= 40:
        return "Moderate Chance"
    elif probability >= 20:
        return "Low Chance"
    elif probability > 0:
        return "Very Low Chance"
    else:
        return "No Chance"

def generate_preference_list(
    student_rank: int,
    quota: str,
    category: str,
    seat_type: str,
    round_no: str,
    min_probability: float = 0
) -> Tuple[pd.DataFrame, Dict]:
    """
    Generate college preference list with admission probabilities
    
    Args:
        student_rank (int): Student's MHTCET rank
        quota (str): Quota type
        category (str): Category
        seat_type (str): Seat type
        round_no (str): Round number
        min_probability (float): Minimum probability threshold
    
    Returns:
        Tuple[pd.DataFrame, Dict]: (Results DataFrame, Plot data)
    """
    try:
        df = load_data()
        if df is None:
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

        # Apply filters
        if quota != "All":
            df = df[df["Quota"] == quota]
        if category != "All":
            df = df[df["Category"] == category]
        if seat_type != "All":
            df = df[df["Seat Type"] == seat_type]
        df = df[df["Round"] == str(round_no)]

        if df.empty:
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

        # Calculate admission probabilities
        df['Admission Probability (%)'] = df['Cutoff rank'].apply(
            lambda x: calculate_admission_probability(student_rank, x)
        )

        # Add interpretation
        df['Admission Chances'] = df['Admission Probability (%)'].apply(get_probability_interpretation)

        # Filter by minimum probability
        df = df[df['Admission Probability (%)'] >= min_probability]
        
        # Sort by probability (descending) and then by cutoff rank (ascending)
        df = df.sort_values(['Admission Probability (%)', 'Cutoff rank'], ascending=[False, True])
        
        # Add preference numbers
        df = df.reset_index(drop=True)
        df['Preference'] = range(1, len(df) + 1)

        # Prepare final result columns
        result_columns = [
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
        ]
        
        # Filter to only include columns that exist in the dataframe
        available_columns = [col for col in result_columns if col in df.columns]
        result = df[available_columns]

        # Prepare plot data
        plot_data = {
            "x": result['Admission Probability (%)'].tolist(),
            "type": "histogram",
            "nbinsx": 20,
            "marker": {
                "color": "#006B6B",
                "line": {
                    "color": "white",
                    "width": 1
                }
            }
        }

        return result, plot_data

    except Exception as e:
        print(f"Error generating preferences: {str(e)}")
        return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}
