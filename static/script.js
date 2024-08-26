let currentQuestions = [];
let isDownloaded = false;
let suppressWarning = false;

function handleBeforeUnload(e) {
    if (!suppressWarning && !isDownloaded) {
        const confirmationMessage = 'You have unsaved changes. If you leave this page, you will lose your current progress.';
        (e || window.event).returnValue = confirmationMessage;
        return confirmationMessage;
    }
}
window.addEventListener('beforeunload', handleBeforeUnload);

function downloadTemplate() {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.location.href = '/download_template';
    setTimeout(() => {
        window.addEventListener('beforeunload', handleBeforeUnload);
    }, 1000);
}

function uploadFile() {
    const input = document.getElementById('fileInput');
    const file = input.files[0];
    if (!file) {
        console.error('No file selected');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        currentQuestions = data.questions;
        isDownloaded = false;
        updateCounters(data.loaded_questions, 0, data.total_questions);
        displayFlashcards(currentQuestions);
        showFlashcardControls();
        showDownloadCurrentButton();
        document.querySelector('.teller-container').style.display = 'block';
    })
    .catch(error => console.error('Error:', error));
}

function updateCounters(loaded, done, total) {
    document.getElementById('loadedQuestions').textContent = loaded;
    document.getElementById('doneThisRound').textContent = done;
    document.getElementById('totalQuestions').textContent = total;
}

function startNewRound() {
    let percentageInput = document.getElementById('percentageInput').value || '0';
    let percentage = parseInt(percentageInput) || 0;
    fetch('/next_round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ percentage_correct: percentage })
    })
    .then(response => response.json())
    .then(data => {
        currentQuestions = data;
        const totalQuestions = document.getElementById('totalQuestions').textContent;
        updateCounters(data.length, 0, totalQuestions);
        displayFlashcards(currentQuestions);
    })
    .catch(error => console.error('Error starting new round:', error));
}

function showFlashcardControls() {
    document.getElementById('downloadTemplateButton').style.display = 'none';
    document.getElementById('fileInput').style.display = 'none';
    document.getElementById('fileInputLabel').style.display = 'none';
    document.getElementById('nextRoundButton').style.display = 'block';
    document.getElementById('downloadCurrentButton').style.display = 'block';
    document.querySelector('.teller-container').style.display = 'block';
    document.getElementById('shuffleButton').style.display = 'block';
    document.getElementById('settingsButton').style.display = 'block';
}

function downloadCurrent() {
    fetch('/download_file')
    .then(response => {
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'flashcards_current.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        isDownloaded = true;
    })
    .catch(error => console.error('Error downloading the file:', error));
}

function displayFlashcards(data) {
    const flashcardsDiv = document.getElementById('flashcards');
    flashcardsDiv.innerHTML = '';
    data.forEach((item, index) => {
        const flashcard = document.createElement('div');
        flashcard.classList.add('flashcard');
        flashcard.innerHTML = `
            <p><strong>Question:</strong> ${item.question}</p>
            <p class="answer hidden"><strong>Answer:</strong> ${item.answer}</p>
            <button onclick="showAnswer(this)" class="button button-primary">Show Answer</button>
            <div class="answer-options hidden">
                <button onclick="markAsCorrect(this, ${item.id}, '${item.answer}')" class="button button-primary">Correct</button>
                <button onclick="markAsIncorrect(this, ${item.id}, '${item.answer}')" class="button button-secondary">Incorrect</button>
            </div>`;
        flashcardsDiv.appendChild(flashcard);
    });
}

function showAnswer(button) {
    const flashcard = button.parentElement;
    flashcard.querySelector('.answer').classList.remove('hidden');
    flashcard.querySelector('.answer-options').classList.remove('hidden');
    button.classList.add('hidden');
}

function markAsCorrect(button, id, answer) {
    trackQuestion(id, answer, 'correct');
    button.classList.add('correct');
    button.nextElementSibling.classList.add('hidden');
}

function markAsIncorrect(button, id, answer) {
    trackQuestion(id, answer, 'incorrect');
    button.classList.add('incorrect');
    button.previousElementSibling.classList.add('hidden');
}

function trackQuestion(id, answer, status) {
    fetch('/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id, answer, status }])
    })
    .then(() => updateStats())
    .catch(error => console.error('Error tracking question:', error));
}

function updateStats() {
    fetch('/get_stats')
    .then(response => response.json())
    .then(data => {
        updateCounters(data.loaded_questions, data.done_this_round, data.total_questions);
    })
    .catch(error => console.error('Error updating stats:', error));
}

function shuffleQuestions() {
    if (currentQuestions.length === 0) {
        console.error('No questions to shuffle');
        return;
    }
    currentQuestions = currentQuestions.sort(() => Math.random() - 0.5);
    const totalQuestions = currentQuestions.length;
    const doneThisRound = currentQuestions.filter(q => q.status !== 'unanswered').length;
    updateCounters(totalQuestions, doneThisRound, totalQuestions);
    displayFlashcards(currentQuestions);
}

function toggleSettingsPopup() {
    const popup = document.getElementById('settingsPopup');
    console.log("Tandwiel icoon geklikt");
    console.log(popup);
    if (popup.classList.contains('hidden')) {
        popup.classList.remove('hidden');
    } else {
        popup.classList.add('hidden');
    }
}
