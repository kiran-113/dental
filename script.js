// Handle tab navigation
function openTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active state from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Activate the selected tab and button
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Handle patient form submission
document.getElementById('patientForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = "Saving patient record...";
    statusDiv.style.backgroundColor = "#eaf4ff";
    statusDiv.style.color = "#0056b3";

    // Construct payload
    const payload = {
        name: document.getElementById('name').value,
        address: document.getElementById('address').value,
        contact_number: document.getElementById('contact').value,
        followup_date: document.getElementById('followup').value,
        medications: document.getElementById('medications').value,
        notes: document.getElementById('notes').value
    };

    try {
        const response = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            statusDiv.textContent = "✅ Patient successfully registered in system!";
            statusDiv.style.backgroundColor = "#d4edda";
            statusDiv.style.color = "#155724";
            document.getElementById('patientForm').reset();
        } else {
            throw new Error("Failed to register patient");
        }
    } catch (error) {
        console.error("Submission Error:", error);
        statusDiv.textContent = "❌ Failed to save. Please verify your Vercel DB connection.";
        statusDiv.style.backgroundColor = "#f8d7da";
        statusDiv.style.color = "#721c24";
    }

    // Auto-clear message after 5 seconds
    setTimeout(() => {
        statusDiv.textContent = "";
        statusDiv.style.backgroundColor = "transparent";
    }, 5000);
});