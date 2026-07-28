import pandas as pd
import uuid
import datetime

def process_faq(input_path, output_path):
    df = pd.read_csv(input_path)
    
    # Rename columns
    df = df.rename(columns={'Instruction': 'question_mm', 'Output': 'answer_mm'})
    
    # Generate schema columns
    df['faq_id'] = [str(uuid.uuid4()) for _ in range(len(df))]
    df['category'] = 'General'
    df['question_en'] = 'Pending English Translation'
    df['answer_en'] = 'Pending English Translation'
    df['source_title'] = 'Agriculture.csv'
    df['source_reference'] = 'Hackathon Seed Data'
    df['last_reviewed_at'] = datetime.datetime.now().isoformat()
    df['version'] = '1.0'
    df['status'] = 'published'
    
    # Select and reorder columns
    cols = [
        'faq_id', 'category', 'question_en', 'question_mm', 
        'answer_en', 'answer_mm', 'source_title', 'source_reference', 
        'last_reviewed_at', 'version', 'status'
    ]
    df = df[cols]
    
    df.to_csv(output_path, index=False)
    print(f"Processed FAQ data saved to {output_path}")

if __name__ == '__main__':
    process_faq('data/raw/faq/Agriculture.csv', 'data/processed/faq_processed.csv')
