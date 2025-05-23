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
            print(f"Data loaded from: {csv_path}")
            print(f"Original data shape: {df.shape}")
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
        
        # Remove entries with invalid cutoff ranks
        original_len = len(df)
        df = df[df["Cutoff rank"] != 999999]
        print(f"Removed {original_len - len(df)} entries with invalid cutoff ranks")
        print(f"Processed data shape: {df.shape}")
        
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
    if student_rank > 200000:
        return False, "MHTCET rank seems too high. Please check your rank."
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
    Optimized for cutoff range: (student_rank - range_lower) to (student_rank + range_upper)
    
    Args:
        student_rank (int): Student's rank
        cutoff_rank (float): Cutoff rank for the college/branch
    
    Returns:
        float: Calculated probability percentage
    """
    try:
        if cutoff_rank == 999999 or cutoff_rank == 0 or pd.isna(cutoff_rank):  # No cutoff data
            return 0.0
        
        # Calculate rank difference (negative means student rank is better)
        rank_difference = student_rank - cutoff_rank
        
        if rank_difference <= 0:
            # Student rank is better than or equal to cutoff - HIGH PROBABILITY
            abs_difference = abs(rank_difference)
            
            if abs_difference >= 800:      # Much better rank (800+ ranks better)
                return 95.0
            elif abs_difference >= 500:    # Very good margin (500-799 ranks better)
                return 90.0
            elif abs_difference >= 300:    # Good margin (300-499 ranks better)
                return 85.0
            elif abs_difference >= 100:    # Decent margin (100-299 ranks better)
                return 80.0
            else:                          # Close to cutoff (0-99 ranks better)
                return 75.0
        else:
            # Student rank is worse than cutoff - LOWER PROBABILITY
            if rank_difference <= 200:     # Very close (1-200 ranks worse)
                return 60.0
            elif rank_difference <= 500:   # Close (201-500 ranks worse)
                return 45.0
            elif rank_difference <= 1000:  # Moderate gap (501-1000 ranks worse)
                return 30.0
            elif rank_difference <= 1500:  # Larger gap (1001-1500 ranks worse)
                return 20.0
            elif rank_difference <= 2000:  # Significant gap (1501-2000 ranks worse)
                return 10.0
            elif rank_difference <= 3000:  # Large gap (2001-3000 ranks worse)
                return 5.0
            else:                          # Very large gap (>3000 ranks worse)
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
    if probability >= 85:
        return "Very High Chance"
    elif probability >= 70:
        return "High Chance"
    elif probability >= 50:
        return "Good Chance"
    elif probability >= 30:
        return "Moderate Chance"
    elif probability >= 15:
        return "Low Chance"
    elif probability > 0:
        return "Very Low Chance"
    else:
        return "No Chance"

def analyze_data_distribution(df: pd.DataFrame, student_rank: int) -> Dict:
    """
    Analyze the distribution of data for debugging and insights
    
    Args:
        df (pd.DataFrame): Filtered dataset
        student_rank (int): Student's rank
        
    Returns:
        Dict: Analysis results
    """
    if df.empty:
        return {"message": "No data to analyze"}
    
    cutoff_ranks = df["Cutoff rank"].dropna()
    
    analysis = {
        "total_records": len(df),
        "cutoff_rank_stats": {
            "min": cutoff_ranks.min(),
            "max": cutoff_ranks.max(),
            "median": cutoff_ranks.median(),
            "mean": cutoff_ranks.mean()
        },
        "student_position": {
            "better_than_cutoff": len(cutoff_ranks[cutoff_ranks >= student_rank]),
            "worse_than_cutoff": len(cutoff_ranks[cutoff_ranks < student_rank]),
            "percentage_better": len(cutoff_ranks[cutoff_ranks >= student_rank]) / len(cutoff_ranks) * 100
        }
    }
    
    return analysis

def generate_preference_list(
    student_rank: int,
    quota: str,
    category: str,
    seat_type: str,
    round_no: str,
    min_probability: float = 0,
    rank_range_lower: int = 1000,  # How many ranks below student rank to consider
    rank_range_upper: int = 3000   # How many ranks above student rank to consider
) -> Tuple[pd.DataFrame, Dict]:
    """
    Generate college preference list with admission probabilities
    Only considers colleges with cutoff ranks in the range: 
    (student_rank - rank_range_lower) to (student_rank + rank_range_upper)
    
    Args:
        student_rank (int): Student's MHTCET rank
        quota (str): Quota type
        category (str): Category
        seat_type (str): Seat type
        round_no (str): Round number
        min_probability (float): Minimum probability threshold
        rank_range_lower (int): Range below student rank to consider
        rank_range_upper (int): Range above student rank to consider
    
    Returns:
        Tuple[pd.DataFrame, Dict]: (Results DataFrame, Plot data)
    """
    try:
        print(f"\n=== Generating Preference List ===")
        print(f"Student Rank: {student_rank}")
        print(f"Search Parameters: {quota}, {category}, {seat_type}, Round {round_no}")
        print(f"Range: -{rank_range_lower} to +{rank_range_upper}")
        
        df = load_data()
        if df is None:
            print("Error: Could not load data")
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

        print(f"Initial dataset size: {len(df)}")

        # Apply user-selected filters
        original_size = len(df)
        
        if quota != "All":
            df = df[df["Quota"] == quota]
            print(f"After quota filter ({quota}): {len(df)} records")
            
        if category != "All":
            df = df[df["Category"] == category]
            print(f"After category filter ({category}): {len(df)} records")
            
        if seat_type != "All":
            df = df[df["Seat Type"] == seat_type]
            print(f"After seat type filter ({seat_type}): {len(df)} records")
            
        df = df[df["Round"] == str(round_no)]
        print(f"After round filter ({round_no}): {len(df)} records")

        if df.empty:
            print("No data found after applying filters")
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

        # NEW: Apply cutoff rank range filter
        min_cutoff_rank = max(1, student_rank - rank_range_lower)  # Ensure minimum rank is 1
        max_cutoff_rank = student_rank + rank_range_upper
        
        print(f"Applying cutoff range filter: {min_cutoff_rank} to {max_cutoff_rank}")
        
        # Filter colleges within the specified cutoff range
        before_range_filter = len(df)
        df = df[
            (df["Cutoff rank"] >= min_cutoff_rank) & 
            (df["Cutoff rank"] <= max_cutoff_rank) & 
            (df["Cutoff rank"] != 999999)  # Exclude entries with no cutoff data
        ]
        
        print(f"After range filter: {len(df)} records (removed {before_range_filter - len(df)})")

        if df.empty:
            print("No colleges found in the specified cutoff range")
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

        # Analyze data distribution for insights
        analysis = analyze_data_distribution(df, student_rank)
        print(f"Data analysis: {analysis}")

        # Calculate admission probabilities using the updated function
        print("Calculating admission probabilities...")
        df['Admission Probability (%)'] = df['Cutoff rank'].apply(
            lambda x: calculate_admission_probability(student_rank, x)
        )

        # Add interpretation
        df['Admission Chances'] = df['Admission Probability (%)'].apply(get_probability_interpretation)

        # Filter by minimum probability
        before_prob_filter = len(df)
        df = df[df['Admission Probability (%)'] >= min_probability]
        print(f"After probability filter (>={min_probability}%): {len(df)} records (removed {before_prob_filter - len(df)})")
        
        if df.empty:
            print(f"No colleges found with probability >= {min_probability}%")
            return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}
        
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
        missing_columns = [col for col in result_columns if col not in df.columns]
        
        if missing_columns:
            print(f"Warning: Missing columns in dataset: {missing_columns}")
        
        result = df[available_columns].copy()

        # Prepare plot data
        probabilities = result['Admission Probability (%)'].tolist()
        plot_data = {
            "x": probabilities,
            "type": "histogram",
            "nbinsx": 20,
            "marker": {
                "color": "#006B6B",
                "line": {
                    "color": "white",
                    "width": 1
                }
            },
            "name": "Admission Probability Distribution"
        }

        # Print summary statistics
        prob_stats = result['Admission Probability (%)'].describe()
        print(f"\nProbability Statistics:")
        print(f"  Mean: {prob_stats['mean']:.1f}%")
        print(f"  Median: {prob_stats['50%']:.1f}%")
        print(f"  Range: {prob_stats['min']:.1f}% - {prob_stats['max']:.1f}%")
        
        # Count by probability ranges
        very_high = len(result[result['Admission Probability (%)'] >= 85])
        high = len(result[(result['Admission Probability (%)'] >= 70) & (result['Admission Probability (%)'] < 85)])
        good = len(result[(result['Admission Probability (%)'] >= 50) & (result['Admission Probability (%)'] < 70)])
        moderate = len(result[(result['Admission Probability (%)'] >= 30) & (result['Admission Probability (%)'] < 50)])
        low = len(result[result['Admission Probability (%)'] < 30])
        
        print(f"\nResults by Probability Category:")
        print(f"  Very High Chance (≥85%): {very_high}")
        print(f"  High Chance (70-84%): {high}")
        print(f"  Good Chance (50-69%): {good}")
        print(f"  Moderate Chance (30-49%): {moderate}")
        print(f"  Low Chance (<30%): {low}")

        print(f"\nFinal result: {len(result)} colleges returned")
        print("=== End Preference List Generation ===\n")

        return result, plot_data

    except Exception as e:
        print(f"Error generating preferences: {str(e)}")
        import traceback
        traceback.print_exc()
        return pd.DataFrame(), {"x": [], "type": "histogram", "nbinsx": 20}

def get_college_statistics(df: pd.DataFrame) -> Dict:
    """
    Get statistics about colleges and branches in the dataset
    
    Args:
        df (pd.DataFrame): The dataset
        
    Returns:
        Dict: Statistics about the data
    """
    if df is None or df.empty:
        return {}
    
    stats = {
        "total_entries": len(df),
        "unique_colleges": df['College name'].nunique() if 'College name' in df.columns else 0,
        "unique_branches": df['Branch name'].nunique() if 'Branch name' in df.columns else 0,
        "quotas": df['Quota'].unique().tolist() if 'Quota' in df.columns else [],
        "categories": df['Category'].unique().tolist() if 'Category' in df.columns else [],
        "seat_types": df['Seat Type'].unique().tolist() if 'Seat Type' in df.columns else [],
        "rounds": df['Round'].unique().tolist() if 'Round' in df.columns else []
    }
    
    return stats

def validate_range_parameters(student_rank: int, rank_range_lower: int, rank_range_upper: int) -> Tuple[bool, str]:
    """
    Validate the range parameters
    
    Args:
        student_rank (int): Student's rank
        rank_range_lower (int): Lower range
        rank_range_upper (int): Upper range
        
    Returns:
        Tuple[bool, str]: (is_valid, message)
    """
    if rank_range_lower < 0:
        return False, "Safe range cannot be negative"
    
    if rank_range_upper < 0:
        return False, "Stretch range cannot be negative"
    
    if rank_range_lower > student_rank:
        return False, "Safe range is larger than your rank - this might include ranks below 1"
    
    if rank_range_lower > 5000:
        return False, "Safe range is too large (maximum 5000)"
    
    if rank_range_upper > 10000:
        return False, "Stretch range is too large (maximum 10000)"
    
    total_range = rank_range_lower + rank_range_upper
    if total_range > 15000:
        return False, "Total search range is too large - please reduce either safe or stretch range"
    
    return True, "Range parameters are valid"
