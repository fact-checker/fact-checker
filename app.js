async function loadDataset() {
    const response = await fetch('dataset.json');
    if (!response.ok) {
        throw new Error("Failed to load dataset");
    }
    return await response.json();
}

function preprocessData(data) {
    return data.map(item => ({
        text: item.text.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
        label: item.label
    }));
}

function encodeText(data, maxLength) {
    const vocab = {};
    let index = 0;

    // Build vocabulary
    data.forEach(item => {
        item.text.split(' ').forEach(word => {
            if (!vocab[word]) {
                vocab[word] = index++;
            }
        });
    });

    // Encode data with padding/truncating to maxLength
    const encodedData = data.map(item => {
        const encoded = item.text.split(' ').map(word => vocab[word] || -1);

        // Padding or truncating to maxLength
        const paddedEncoded = encoded.length < maxLength
            ? [...encoded, ...Array(maxLength - encoded.length).fill(-1)]  // Pad with -1
            : encoded.slice(0, maxLength);  // Truncate to maxLength

        return { encoded: paddedEncoded, label: item.label };
    });

    return { encodedData, vocab };
}

function createModel(inputShape) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
    return model;
}

async function trainModel(model, trainingData) {
    const xs = tf.tensor2d(trainingData.map(item => item.encoded));
    const ys = tf.tensor2d(trainingData.map(item => item.label), [trainingData.length, 1]);

    const earlyStopping = tf.callbacks.earlyStopping({
        monitor: 'val_loss', // Monitor validation loss
        patience: 5,         // Number of epochs with no improvement after which training will be stopped
    });

    await model.fit(xs, ys, {
        epochs: 50,
        validationSplit: 0.2, // Use 20% of the data for validation
        callbacks: [earlyStopping]
    });
}

async function analyzeContent(model, vocab, text) {
    const maxLength = 40; // Define the max length for encoding
    const encodedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
        .split(' ').map(word => vocab[word] || -1);

    // Padding or truncating to maxLength
    const paddedEncodedText = encodedText.length < maxLength
        ? [...encodedText, ...Array(maxLength - encodedText.length).fill(-1)]
        : encodedText.slice(0, maxLength);

    const inputTensor = tf.tensor2d([paddedEncodedText]);
    const prediction = model.predict(inputTensor);
    const result = await prediction.data();
    return result[0] >= 0.5 
        ? 'generated by <span style="color: #FF0000;">Artificial Intelligence (AI)</span>.' 
        : 'written by a <span style="color: #34C759;">human</span>.';
}

async function retrainModel(newDataset) {
    const preprocessedData = preprocessData(newDataset);
    const { encodedData, vocab } = encodeText(preprocessedData, 40); // Use the same maxLength

    let model;
    try {
        model = await loadModel(); // Implement loadModel to fetch the existing model
    } catch (error) {
        console.error("Failed to load model, creating a new one:", error);
        model = createModel([40]); // Create a new model if loading fails
    }

    // Retrain the model with the new data
    await trainModel(model, encodedData);

    // Save the retrained model
    await model.save('localstorage://your-model-name'); // Save to local storage
}

// Load the model function
async function loadModel() {
    return await tf.loadLayersModel('localstorage://your-model-name'); // Update with your model name
}

document.getElementById('checkBtn').addEventListener('click', async function() {
    const content = document.getElementById('contentInput').value.trim();
    const resultElement = document.getElementById('result');
    const loader = document.getElementById('loader');

    if (!content) {
        alert("Please enter some content.");
        return;
    }

    const maxLength = 40; // Define the max length for encoding

    // Show loader and hide results initially
    loader.style.display = 'block';
    resultElement.style.display = 'none';

    try {
        const dataset = await loadDataset();
        const preprocessedData = preprocessData(dataset);
        const { encodedData, vocab } = encodeText(preprocessedData, maxLength); // Pass maxLength

        const model = createModel([maxLength]); // Update input shape to maxLength
        await trainModel(model, encodedData);

        const result = await analyzeContent(model, vocab, content);
        
        // Hide loader and show the result
        loader.style.display = 'none';
        resultElement.innerHTML = `This content was ${result}`;
        resultElement.style.display = 'block';
    } catch (error) {
        console.error(error);
        alert("An error has occurred. Check the console for details.");
        loader.style.display = 'none'; // Hide loader if there's an error
    }
});

// Retrain button event listener
document.getElementById('retrainBtn').addEventListener('click', async function() {
    const newDataset = await loadDataset(); // Load new dataset for retraining
    try {
        await retrainModel(newDataset); // Retrain the model with new data
        alert("Model retrained successfully!");
    } catch (error) {
        console.error("Error during retraining:", error);
        alert("Failed to retrain the model. Check the console for details.");
    }
});