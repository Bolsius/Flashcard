let currentQuestions = [];
let isDownloaded = false;
let suppressWarning = false;

console.log("script.js is geladen");

window.addEventListener('beforeunload', handleBeforeUnload);

document.addEventListener('DOMContentLoaded', function() {
    const settingsButton = document.getElementById('settingsButton');
    const backdrop = document.getElementById('settingsPopupBackdrop');
    const closeButton = document.querySelector('.close-popup'); // De "X" knop

    if (settingsButton && backdrop) {
        settingsButton.addEventListener('click', toggleSettingsPopup);
        backdrop.addEventListener('click', toggleSettingsPopup);
    }

    if (closeButton) {
        closeButton.addEventListener('click', toggleSettingsPopup); // Sluit popup bij klikken op "X"
    }
});

function toggleSettingsPopup() {
    console.log("toggleSettingsPopup is called");
    const popup = document.getElementById('settingsPopup');
    const backdrop = document.getElementById('settingsPopupBackdrop');

    if (popup.classList.contains('hidden')) {
        popup.classList.remove('hidden');
        backdrop.classList.remove('hidden');
    } else {
        popup.classList.add('hidden');
        backdrop.classList.add('hidden');
    }
}

function closePopupOnClickOutside(event) {
    const popup = document.getElementById('settingsPopup');
    if (!popup.contains(event.target) && !event.target.closest('#settingsButton')) {
        popup.classList.add('hidden');
        document.removeEventListener('click', closePopupOnClickOutside);
    }
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

        // Vul de categorieën in de multiselect dropdown
        const uniqueCategories = [...new Set(data.questions.map(q => q.category))];
        populateCategorySelect(uniqueCategories);
    })
    .catch(error => console.error('Error:', error));
}

function downloadTemplate() {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.location.href = '/download_template';
    setTimeout(() => {
        window.addEventListener('beforeunload', handleBeforeUnload);
    }, 1000);
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


function handleCorrectClick(button) {
    const flashcard = button.closest('.flashcard');
    const id = flashcard.querySelector('.flashcard-id').textContent.replace('#', '');

    // Markeer als correct en update de status in de backend
    trackQuestion(id, 'correct');

    // Visueel effect: kleur de knop groen
    button.classList.add('correct');
    button.style.backgroundColor = 'green';

    // Verberg de incorrect knop
    button.nextElementSibling.style.display = 'none';

    // Toon de redo knop
    const redoText = flashcard.querySelector('.redo-text');
    redoText.classList.remove('hidden');
    redoText.style.display = 'block'; // Zorg ervoor dat het zichtbaar wordt
    redoText.onclick = function() {
        resetAnswerButtons(button);
    };

    // Update de statistieken
    updateStats();
}

function handleIncorrectClick(button) {
    const flashcard = button.closest('.flashcard');
    const id = flashcard.querySelector('.flashcard-id').textContent.replace('#', '');

    // Markeer als incorrect en update de status in de backend
    trackQuestion(id, 'incorrect');

    // Visueel effect: kleur de knop rood
    button.classList.add('incorrect');
    button.style.backgroundColor = 'red';

    // Verberg de correct knop
    button.previousElementSibling.style.display = 'none';

    // Toon de redo knop
    const redoText = flashcard.querySelector('.redo-text');
    redoText.classList.remove('hidden');
    redoText.style.display = 'block'; // Zorg ervoor dat het zichtbaar wordt
    redoText.onclick = function() {
        resetAnswerButtons(button.previousElementSibling);
    };

    // Update de statistieken
    updateStats();
}

function resetAnswerButtons(correctButton) {
    const flashcard = correctButton.closest('.flashcard');
    const incorrectButton = correctButton.nextElementSibling;

    // Reset de knoppen: maak ze weer zichtbaar en verwijder de kleuring
    correctButton.style.display = 'block';
    correctButton.classList.remove('correct');
    correctButton.style.backgroundColor = ''; // Verwijder de groene kleur

    incorrectButton.style.display = 'block';
    incorrectButton.classList.remove('incorrect');
    incorrectButton.style.backgroundColor = ''; // Verwijder de rode kleur

    // Verberg de redo knop
    const redoText = flashcard.querySelector('.redo-text');
    redoText.classList.add('hidden');
    redoText.style.display = 'none'; // Zorg ervoor dat het verborgen wordt

    // Zorg ervoor dat de knoppen correct zijn uitgelijnd in het midden en naast elkaar
    const answerOptions = flashcard.querySelector('.answer-options');
    answerOptions.classList.remove('hidden');
    answerOptions.style.display = 'flex'; // Zorg ervoor dat de knoppen naast elkaar staan
    correctButton.style.margin = '0 5px'; // Zorg voor ruimte tussen de knoppen
    incorrectButton.style.margin = '0 5px'; // Zorg voor ruimte tussen de knoppen

    // Reset de status van de vraag in de backend
    const id = flashcard.querySelector('.flashcard-id').textContent.replace('#', '');
    trackQuestion(id, 'unanswered');
}




function trackQuestion(id, status) {
    fetch('/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id, status }])
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log(`Question ${id} marked as ${status}`);
        } else {
            console.error('Failed to track question:', data.error);
        }
    })
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

function updateCounters(loaded, done, total) {
    document.getElementById('loadedQuestions').textContent = loaded;
    document.getElementById('doneThisRound').textContent = done;
    document.getElementById('totalQuestions').textContent = total;
}


function updateCounters(loaded, done, total) {
    document.getElementById('loadedQuestions').textContent = loaded;
    document.getElementById('doneThisRound').textContent = done;
    document.getElementById('totalQuestions').textContent = total;
}
function displayFlashcards(data) {
    const flashcardsDiv = document.getElementById('flashcards');
    flashcardsDiv.innerHTML = '';
    data.forEach((item, index) => {
        const flashcard = document.createElement('div');
        flashcard.classList.add('flashcard');
        flashcard.innerHTML = `
            <div class="flashcard-category">${item.category}</div>
            <div class="flashcard-number">${index + 1}/${data.length}</div>
            <div class="flashcard-id hidden">#${item.id}</div>
            <p>${item.question}</p>
            <p class="answer hidden"><strong>Answer:</strong> ${item.answer}</p>
            <button onclick="showAnswer(this)" class="button button-primary">Show Answer</button>
            <div class="answer-options hidden">  <!-- Knoppen verborgen tot Show Answer wordt ingedrukt -->
                <button onclick="handleCorrectClick(this)" class="button button-primary">Correct</button>
                <button onclick="handleIncorrectClick(this)" class="button button-secondary">Incorrect</button>
                <div class="redo-text hidden">Redo</div> <!-- "Redo"-tekst standaard verborgen -->
            </div>
        `;
        flashcardsDiv.appendChild(flashcard);
    });
}


function showAnswer(button) {
    const flashcard = button.parentElement;
    flashcard.querySelector('.answer').classList.remove('hidden');
    flashcard.querySelector('.answer-options').classList.remove('hidden');
    button.classList.add('hidden');

    // Toon de ID van de vraag
    const flashcardId = flashcard.querySelector('.flashcard-id');
    if (flashcardId) {
        flashcardId.classList.remove('hidden');
    }

    // Verberg de "Redo"-tekst tot een actie wordt uitgevoerd
    const redoText = flashcard.querySelector('.redo-text');
    redoText.classList.add('hidden');
    redoText.style.display = 'none';
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

function shuffleQuestions() {
    const percentageInput = document.getElementById('percentageInput').value || '0';
    const questionCountInput = document.getElementById('questionCountInput').value;

    const percentage = parseInt(percentageInput) || 0;
    const questionCount = questionCountInput && parseInt(questionCountInput) > 0 ? parseInt(questionCountInput) : null;

    // Als currentQuestions leeg is, kopieer dan de originele lijst
    if (currentQuestions.length === 0) {
        currentQuestions = originalQuestions.slice(); // Veronderstel dat originalQuestions de originele set is
    }

    // Verdeel de vragen in correct en incorrect
    const correctQuestions = currentQuestions.filter(q => q.status === 'correct');
    const incorrectQuestions = currentQuestions.filter(q => q.status !== 'correct');

    // Bereken het aantal correcte vragen dat opnieuw moet worden toegevoegd
    const correctToIncludeCount = Math.ceil((percentage / 100) * correctQuestions.length);
    
    // Voeg de correcte vragen en incorrecte vragen samen
    const pool = [...incorrectQuestions, ...correctQuestions.slice(0, correctToIncludeCount)];

    // Schud de vragen en selecteer het gewenste aantal
    const shuffledQuestions = questionCount ? pool.sort(() => Math.random() - 0.5).slice(0, questionCount) : pool.sort(() => Math.random() - 0.5);

    // Update de counters en toon de geselecteerde vragen
    const totalQuestions = currentQuestions.length;  // Altijd het totale aantal beschikbare vragen
    const doneThisRound = shuffledQuestions.filter(q => q.status !== 'unanswered').length;
    updateCounters(shuffledQuestions.length, doneThisRound, totalQuestions);
    displayFlashcards(shuffledQuestions);
}

function populateCategorySelect(categories) {
    const categorySelect = document.getElementById('categorySelect');
    categorySelect.innerHTML = ''; // Maak de huidige opties leeg

    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
}

function showDownloadCurrentButton() {
    document.getElementById('downloadCurrentButton').style.display = 'block';
}
