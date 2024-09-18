from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import io
from openpyxl import Workbook

app = Flask(__name__)

# Globale variabele om de geüploade data op te slaan
uploaded_df = pd.DataFrame()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    global uploaded_df
    try:
        file = request.files['file']
        if not file:
            return jsonify({'error': 'No file provided'}), 400

        # Lees het Excel-bestand in een DataFrame
        uploaded_df = pd.read_excel(file)

        # Voeg extra kolommen toe indien ze niet bestaan
        if 'correct' not in uploaded_df.columns:
            uploaded_df['correct'] = 0
        if 'incorrect' not in uploaded_df.columns:
            uploaded_df['incorrect'] = 0
        if 'status' not in uploaded_df.columns:
            uploaded_df['status'] = 'unanswered'

        # Stuur de ingelezen data terug naar de frontend
        questions = uploaded_df.to_dict(orient='records')
        return jsonify({
            'questions': questions,
            'loaded_questions': len(questions),
            'total_questions': len(questions)
        })
    except Exception as e:
        return jsonify({'error': f'Failed to read Excel file: {str(e)}'}), 400

@app.route('/track', methods=['POST'])
def track_question():
    global uploaded_df
    try:
        data = request.json
        for item in data:
            question_id = int(item.get('id'))
            status = item.get('status')

            # Update de status van de vraag
            uploaded_df.loc[uploaded_df['id'] == question_id, 'status'] = status
            
            # Update de correct en incorrect tellers
            if status == 'correct':
                uploaded_df.loc[uploaded_df['id'] == question_id, 'correct'] += 1
            elif status == 'incorrect':
                uploaded_df.loc[uploaded_df['id'] == question_id, 'incorrect'] += 1

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

@app.route('/get_stats', methods=['GET'])
def get_stats():
    try:
        done_this_round = len(uploaded_df[(uploaded_df['status'] == 'correct') | (uploaded_df['status'] == 'incorrect')])
        loaded_questions = len(uploaded_df)
        total_questions = len(uploaded_df)

        return jsonify({
            'loaded_questions': loaded_questions,
            'done_this_round': done_this_round,
            'total_questions': total_questions
        })
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve stats: {str(e)}'}), 500

@app.route('/download_file', methods=['GET'])
def download_current():
    global uploaded_df

    try:
        if uploaded_df is None or uploaded_df.empty:
            print("No data available for download.")
            return jsonify({'error': 'No data to download'}), 400

        print("Data is available, starting to generate the Excel file...")

        wb = Workbook()
        ws = wb.active
        headers = ['id', 'question', 'answer', 'category', 'correct', 'incorrect', 'status']
        ws.append(headers)

        for index, row in uploaded_df.iterrows():
            ws.append([
                row['id'],
                row['question'],
                row['answer'],
                row['category'],
                row['correct'],
                row['incorrect'],
                row['status']
            ])

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        print(f"Excel file generated, size: {output.getbuffer().nbytes} bytes")

        return send_file(
            output,
            as_attachment=True,
            download_name='flashcards_current.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        print(f"Failed to generate Excel file: {str(e)}")
        return jsonify({'error': f'Failed to generate Excel file: {str(e)}'}), 500

@app.route('/next_round', methods=['POST'])
def next_round():
    global uploaded_df
    try:
        data = request.json
        percentage_correct = data.get('percentage_correct', 0)
        selected_categories = data.get('categories', [])

        if not selected_categories:
            selected_categories = uploaded_df['category'].unique().tolist()

        # Filter de vragen op basis van de geselecteerde categorieën
        filtered_df = uploaded_df[uploaded_df['category'].isin(selected_categories)]

        # Bereken het aantal correcte vragen dat opnieuw moet worden toegevoegd
        correct_questions = filtered_df[filtered_df['status'] == 'correct']
        incorrect_questions = filtered_df[filtered_df['status'] != 'correct']
        correct_to_include_count = round((percentage_correct / 100) * len(correct_questions))

        # Maak een nieuwe pool van vragen en shuffle ze
        pool = pd.concat([incorrect_questions, correct_questions[:correct_to_include_count]])
        shuffled_questions = pool.sample(frac=1).to_dict(orient='records')

        return jsonify(shuffled_questions)
    except Exception as e:
        return jsonify({'error': f'Failed to generate next round: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
