from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
import io
from openpyxl import Workbook  # Deze import moet hier staan

app = Flask(__name__)
uploaded_df = None  # Variabele om het geüploade Excel-bestand op te slaan
correct_incorrect_tracker = None  # Variabele om de status van correct/fout bij te houden

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/track', methods=['POST'])
def track_question():
    try:
        data = request.json
        for item in data:
            question_id = item.get('id')
            status = item.get('status')
            
            # Update de status van de vraag
            uploaded_df.loc[uploaded_df['id'] == question_id, 'status'] = status
            
            # Update de correcte of incorrecte teller op basis van de nieuwe status
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
        loaded_questions = len(uploaded_df)
        done_this_round = len(uploaded_df[uploaded_df['status'] != 'unanswered'])
        total_questions = len(uploaded_df)
        return jsonify({
            'loaded_questions': loaded_questions,
            'done_this_round': done_this_round,
            'total_questions': total_questions
        })
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500

import random

@app.route('/next_round', methods=['POST'])
def next_round():
    global uploaded_df

    try:
        data = request.json
        percentage_correct = data.get('percentage_correct', 0)

        # Selecteer de incorrecte vragen
        incorrect_questions = uploaded_df[uploaded_df['status'] == 'incorrect']

        # Selecteer een percentage van de correcte vragen
        correct_questions = uploaded_df[uploaded_df['status'] == 'correct']
        num_correct_to_include = int(len(correct_questions) * (percentage_correct / 100))
        correct_questions_to_include = correct_questions.sample(n=num_correct_to_include)

        # Combineer incorrecte en geselecteerde correcte vragen
        next_round_questions = pd.concat([incorrect_questions, correct_questions_to_include])

        # Verwijder dubbele vragen (voor het geval een vraag correct en incorrect is)
        next_round_questions = next_round_questions.drop_duplicates(subset=['id'])

        # Shuffle de vragen voor een random volgorde
        next_round_questions = next_round_questions.sample(frac=1).reset_index(drop=True)

        questions = next_round_questions.to_dict(orient='records')

        return jsonify(questions), 200

    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500


@app.route('/download_template')
def download_template():
    try:
        df = pd.DataFrame({
            'id': [1],
            'question': [''],
            'answer': [''],
            'correct': [0],
            'incorrect': [0],
            'status': ['unanswered']
        })

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, startrow=0)
            workbook = writer.book
            worksheet = writer.sheets['Sheet1']
            worksheet.write('A2', 1)
            for row_num in range(3, 102):
                cell_address = f'A{row_num}'
                worksheet.write_formula(cell_address, f'=IF(B{row_num}="", "", A{row_num-1}+1)')
        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name='flashcards_template.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        return jsonify({'error': f'An error occurred while generating the template: {str(e)}'}), 500

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
        headers = ['id', 'question', 'answer', 'correct', 'incorrect', 'status']
        ws.append(headers)

        for index, row in uploaded_df.iterrows():
            ws.append([
                row['id'],
                row['question'],
                row['answer'],
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

@app.route('/upload', methods=['POST'])
def upload():
    global uploaded_df, correct_incorrect_tracker
    try:
        if 'file' not in request.files:
            print("No file part in the request")
            return jsonify({'error': 'No file part in the request'}), 400

        file = request.files['file']
        print(f"Received file: {file.filename}, Content-Type: {file.content_type}")
        
        if file.filename == '':
            print("No selected file")
            return jsonify({'error': 'No selected file'}), 400

        try:
            uploaded_df = pd.read_excel(file)
            print("File read successfully")
            
            uploaded_df['correct'] = uploaded_df['correct'].fillna(0)
            uploaded_df['incorrect'] = uploaded_df['incorrect'].fillna(0)
            uploaded_df['status'] = uploaded_df['status'].fillna('unanswered')

            print(uploaded_df.head())

        except Exception as e:
            print(f"Failed to read Excel file: {str(e)}")
            return jsonify({'error': f'Failed to read Excel file: {str(e)}'}), 400
        
        required_columns = ['id', 'question', 'answer', 'correct', 'incorrect', 'status']
        for column in required_columns:
            if column not in uploaded_df.columns:
                print(f"Missing required column: {column}")
                return jsonify({'error': f'Missing required column: {column}'}), 400

        correct_incorrect_tracker = uploaded_df.copy()
        questions = correct_incorrect_tracker.to_dict(orient='records')
        total_questions = len(uploaded_df)  # Totaal aantal vragen opslaan
        print("File processing complete")
        return jsonify({
            'questions': questions,
            'loaded_questions': len(uploaded_df),
            'total_questions': total_questions  # Totaal aantal vragen meegeven
        })
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")
        return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True)
