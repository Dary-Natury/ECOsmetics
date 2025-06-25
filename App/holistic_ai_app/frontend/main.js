/**
 * @file Main application script for the Holistic Cosmetics Selector.
 * @description This script handles all page interactivity, including the dynamic wizard,
 * the AI creator simulation, and mobile navigation. It uses data fetched from a backend API.
 */
document.addEventListener('DOMContentLoaded', async () => { 
    let productsDataFromAPI = []; 

    try {
        const response = await fetch('/api/products');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        productsDataFromAPI = await response.json();
        if (!Array.isArray(productsDataFromAPI)) {
            throw new Error("Dane z API nie są tablicą.");
        }
    } catch (error) {
        console.error("Nie udało się załadować danych produktów z API:", error);
        const wizardContainer = document.getElementById('wizard-content-container');
        if (wizardContainer) {
            wizardContainer.innerHTML = `<p class="text-center text-red-500">Błąd krytyczny: Nie udało się załadować danych produktów z serwera.</p>`;
        }
        return; 
    }

    const AppState = {
        products: productsDataFromAPI,
        wizardStepsConfig: [], 
        currentWizardStepIndex: 0,
        userChoices: {}, 
        currentFilteredProducts: [...productsDataFromAPI]
    };

    const DOMElements = {
        mobileMenuButton: document.getElementById('mobile-menu-button'),
        mobileMenu: document.getElementById('mobile-menu'),
        wizard: document.getElementById('wizard'),
        wizardContentContainer: document.getElementById('wizard-content-container'),
        resultsContainer: document.getElementById('results-container'),
        wizardNavigation: document.getElementById('wizard-navigation'),
        modal: document.getElementById('modal'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
        closeModalBtn: document.getElementById('close-modal'),
        modalBackdrop: document.querySelector('.modal-backdrop'),
        generateFormulaBtn: document.getElementById('generate-formula'),
        baseSelect: document.getElementById('base'),
        activeIngredientsPlaceholder: document.getElementById('active-ingredients-selector-placeholder'),
        productTypeSelect: document.getElementById('product-type-ai'), 
        formulaOutput: document.getElementById('formula-output'),
        formulaText: document.getElementById('formula-text'),
        activeIngredientsCheckboxes: null
    };

    function getUniqueOptionsFromCriteriaArray(products, keyInCriteria) {
        if (!products) return [];
        const allOptions = products.flatMap(p => (p.criteria && Array.isArray(p.criteria[keyInCriteria]) ? p.criteria[keyInCriteria] : []));
        return Array.from(new Set(allOptions)).filter(Boolean).sort();
    }
    
    function getUniqueOptionsFromArray(products, productKey) {
        if (!products) return [];
        const allOptions = products.flatMap(p => (Array.isArray(p[productKey]) ? p[productKey] : []));
        return Array.from(new Set(allOptions)).filter(Boolean).sort();
    }

    function getAllUniqueMainIngredients(allProducts) {
        if (!allProducts || allProducts.length === 0) return [];
        const allMainIngredients = allProducts.flatMap(p => (Array.isArray(p.main_ingredients) ? p.main_ingredients : []));
        return Array.from(new Set(allMainIngredients)).filter(Boolean).sort();
    }

    function initWizardConfig() {
        AppState.wizardStepsConfig = [
            {
                id: 'grupaWiekowa',
                question: "Dla jakiej grupy wiekowej szukasz produktu?",
                getOptions: () => {
                    const hasDorosly = AppState.products.some(p => p.criteria.grupaWiekowa && p.criteria.grupaWiekowa.includes("Dorosły"));
                    const hasDziecko = AppState.products.some(p => p.criteria.grupaWiekowa && p.criteria.grupaWiekowa.includes("Dziecko"));
                    let options = [];
                    if (hasDorosly) options.push("Dorosły");
                    if (hasDziecko) options.push("Dziecko");
                    options.push("Wszystkie"); 
                    return options.sort();
                },
                filterLogic: (product, choice) => {
                    if (choice === "Wszystkie") return true; 
                    return product.criteria.grupaWiekowa && product.criteria.grupaWiekowa.includes(choice);
                }
            },
            {
                id: 'obszarCiala',
                question: "Dla jakiego obszaru ciała?",
                getOptions: (filteredProducts) => getUniqueOptionsFromCriteriaArray(filteredProducts, 'obszarCiala'),
                filterLogic: (product, choice) => product.criteria.obszarCiala && product.criteria.obszarCiala.includes(choice)
            },
            {
                id: 'dzialanieZastosowanie',
                question: "Jakie działanie lub zastosowanie Cię interesuje?",
                getOptions: (filteredProducts) => {
                    const dzialania = getUniqueOptionsFromCriteriaArray(filteredProducts, 'dzialanie');
                    const zastosowania = getUniqueOptionsFromCriteriaArray(filteredProducts, 'zastosowanie');
                    return Array.from(new Set([...dzialania, ...zastosowania])).sort();
                },
                filterLogic: (product, choice) => 
                    (product.criteria.dzialanie && product.criteria.dzialanie.includes(choice)) || 
                    (product.criteria.zastosowanie && product.criteria.zastosowanie.includes(choice))
            },
            {
                id: 'chceSkladnik',
                question: "Czy chcesz wybrać konkretny składnik aktywny?",
                type: 'boolean', 
                options: ["Tak", "Nie"] 
            },
            {
                id: 'mainIngredients',
                question: "Wybierz główny składnik:",
                getOptions: (filteredProducts) => getUniqueOptionsFromArray(filteredProducts, 'main_ingredients'), 
                filterLogic: (product, choice) => product.main_ingredients && product.main_ingredients.includes(choice),
                dependsOn: { stepId: 'chceSkladnik', value: 'Tak' } 
            }
        ];
    }

    function applyFilters() {
        let products = [...AppState.products]; 
        for (const key in AppState.userChoices) {
            const choice = AppState.userChoices[key];
            const stepConfig = AppState.wizardStepsConfig.find(s => s.id === key);

            if (stepConfig && stepConfig.filterLogic) {
                if (key === 'chceSkladnik' && choice === 'Nie') { 
                    continue;
                }
                products = products.filter(p => stepConfig.filterLogic(p, choice));
            }
        }
        AppState.currentFilteredProducts = products;
        return products;
    }

    function renderCurrentWizardStep() {
        DOMElements.resultsContainer.classList.add('hidden');
        DOMElements.wizardContentContainer.classList.remove('hidden');

        const stepConfig = AppState.wizardStepsConfig[AppState.currentWizardStepIndex];

        if (!stepConfig) { 
            displayResults();
            return;
        }

        if (stepConfig.dependsOn) {
            const dependingStepChoice = AppState.userChoices[stepConfig.dependsOn.stepId];
            if (dependingStepChoice !== stepConfig.dependsOn.value) {
                AppState.currentWizardStepIndex++; 
                renderCurrentWizardStep(); 
                return;
            }
        }
        
        let options;
        if (stepConfig.type === 'boolean') {
            options = stepConfig.options;
        } else {
            let productsToGetOptionsFrom = [...AppState.products]; 
            for (let i = 0; i < AppState.currentWizardStepIndex; i++) { 
                const previousStep = AppState.wizardStepsConfig[i];
                const choiceForPreviousStep = AppState.userChoices[previousStep.id];
                if (choiceForPreviousStep && previousStep.filterLogic) {
                    if (previousStep.id === 'chceSkladnik' && choiceForPreviousStep === 'Nie') {
                        continue; 
                    }
                    productsToGetOptionsFrom = productsToGetOptionsFrom.filter(p => previousStep.filterLogic(p, choiceForPreviousStep));
                }
            }
            if (productsToGetOptionsFrom.length === 0 && AppState.currentWizardStepIndex > 0) { 
                displayResults();
                return;
            }
            options = stepConfig.getOptions(productsToGetOptionsFrom);
        }

        if (!options || options.length === 0) {
            displayResults();
            return;
        }

        const optionsHtml = options.map(option =>
            `<button data-step-id="${stepConfig.id}" data-value="${option}" class="wizard-button p-4 border rounded-lg hover:bg-[#F8F4EF] hover:border-[#A0522D] transition">${option}</button>`
        ).join('');

        DOMElements.wizardContentContainer.innerHTML = `
            <h4 class="text-2xl font-semibold text-center mb-6">${stepConfig.question}</h4>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4">${optionsHtml}</div>
        `;
        renderWizardNavigation();
    }

    function renderWizardNavigation() {
        const backButton = AppState.currentWizardStepIndex > 0 ? `<button id="back-btn" class="text-[#A0522D] hover:underline">Wróć</button>` : '<div class="w-16"></div>';
        
        let visibleStepsCount = AppState.wizardStepsConfig.length;
        if (AppState.userChoices.chceSkladnik === 'Nie' && AppState.wizardStepsConfig.find(s => s.id === 'mainIngredients')) {
            visibleStepsCount--; 
        }

        if (DOMElements.resultsContainer.classList.contains('hidden')) { 
             DOMElements.wizardNavigation.innerHTML = `
                ${backButton}
                <div class="text-xs text-gray-500">Krok ${AppState.currentWizardStepIndex + 1} z ${visibleStepsCount}</div>
                <div class="w-16"></div> 
            `;
        } else { 
             DOMElements.wizardNavigation.innerHTML = `<button id="restart-btn" class="bg-[#A0522D] text-white font-bold py-2 px-6 rounded-lg hover:bg-[#8B4513] transition">Zacznij od nowa</button>`;
        }
    }

    function displayResults() {
        DOMElements.wizardContentContainer.classList.add('hidden');
        DOMElements.resultsContainer.classList.remove('hidden');

        const finalFilteredProducts = applyFilters(); 
        const uniqueProducts = Array.from(new Map(finalFilteredProducts.map(p => [p.id, p])).values());

        DOMElements.resultsContainer.innerHTML = uniqueProducts.length > 0
            ? `<h4 class="text-2xl font-semibold text-center mb-6">Oto Twoje spersonalizowane rekomendacje:</h4>
               <div class="space-y-4">${uniqueProducts.map(createProductCardHTML).join('')}</div>`
            : '<p class="text-center text-gray-600">Przepraszamy, nie znaleziono rekomendacji dla tego połączenia. Spróbuj ponownie, wybierając mniej kryteriów lub inną kombinację.</p>';
        
        renderWizardNavigation(); 
    }

    function createProductCardHTML(product) {
        const linkButton = product.link ? `<a href="${product.link}" target="_blank" rel="noopener noreferrer" class="text-sm bg-[#6B5B4B] text-white py-1 px-3 rounded hover:bg-[#3D3A37] transition inline-block">Zobacz produkt</a>` : '';
        const mainIngredientsHTML = product.main_ingredients && product.main_ingredients.length > 0 
            ? `<p class="text-sm mt-2"><strong class="font-medium">Składniki aktywne:</strong> ${product.main_ingredients.join(', ')}</p>` 
            : '';

        return `
            <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 text-left">
                <h5 class="font-bold text-lg text-[var(--primary-brand)]">${product.name}</h5>
                ${mainIngredientsHTML}
                <div class="flex flex-wrap gap-2 mt-3">
                    <button data-action="ingredients" data-id="${product.id}" class="text-sm bg-[#A0522D] text-white py-1 px-3 rounded hover:bg-[#8B4513] transition">Zobacz pełny skład</button>
                    ${linkButton}
                </div>
            </div>`;
    }
    
    function resetWizard() {
        AppState.currentWizardStepIndex = 0;
        AppState.userChoices = {};
        AppState.currentFilteredProducts = [...AppState.products];
        DOMElements.resultsContainer.classList.add('hidden');
        DOMElements.wizardContentContainer.classList.remove('hidden');
        renderCurrentWizardStep();
    }

    function toggleMobileMenu() {
        DOMElements.mobileMenu.classList.toggle('hidden');
    }

    function setupAiCreator() {
        const activeIngredientsOptions = getAllUniqueMainIngredients(AppState.products); 

        const placeholderDiv = DOMElements.activeIngredientsPlaceholder; 

        if (!placeholderDiv) {
            console.error("Placeholder div ('active-ingredients-selector-placeholder') for AI active ingredients not found!");
            return;
        }
        
        const checkboxesContainer = document.createElement('div');
        checkboxesContainer.className = "space-y-1 max-h-48 overflow-y-auto border p-2 rounded-md"; 
        
        if (activeIngredientsOptions.length === 0) {
            checkboxesContainer.innerHTML = `<p class="text-sm text-gray-500">Brak dostępnych składników aktywnych do wyboru.</p>`;
        } else {
            activeIngredientsOptions.forEach(opt => {
                const checkboxId = `ai-active-${opt.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')}`;
                checkboxesContainer.innerHTML += `
                    <div class="flex items-center">
                        <input type="checkbox" id="${checkboxId}" name="ai_active_ingredient" value="${opt}" class="h-4 w-4 text-[#A0522D] border-gray-300 rounded focus:ring-[#A0522D] mr-2">
                        <label for="${checkboxId}" class="text-sm">${opt}</label>
                    </div>
                `;
            });
        }
        
        placeholderDiv.innerHTML = ''; 
        placeholderDiv.appendChild(checkboxesContainer);
        DOMElements.activeIngredientsCheckboxes = checkboxesContainer; 

        if (!DOMElements.productTypeSelect) {
             DOMElements.productTypeSelect = document.getElementById('product-type-ai');
        }
        if (!DOMElements.productTypeSelect) {
             console.error("product-type-ai select element still not found in DOM for AI creator.");
        }
    }

    async function generateAiFormula() {
        const base = DOMElements.baseSelect.value;
        const selectedActiveCheckboxes = DOMElements.activeIngredientsCheckboxes ? Array.from(DOMElements.activeIngredientsCheckboxes.querySelectorAll('input[name="ai_active_ingredient"]:checked')) : [];
        
        if (selectedActiveCheckboxes.length > 3) { 
            alert("Możesz wybrać maksymalnie 3 składniki aktywne.");
            return;
        }
        const activeIngredients = selectedActiveCheckboxes.map(cb => cb.value);
        
        if (!DOMElements.productTypeSelect) {
            DOMElements.formulaText.value = "Błąd: Nie można określić typu produktu.";
            DOMElements.formulaOutput.classList.remove('hidden');
            return;
        }
        const productType = DOMElements.productTypeSelect.value;

        const initialInfo = `GENEROWANIE RECEPTURY PRZEZ AI...\nTyp: ${productType}\nBaza: ${base}\nSkładniki Aktywne: ${activeIngredients.join(', ') || 'brak'}\n\nProszę czekać...\n`;
        DOMElements.formulaText.value = initialInfo;
        DOMElements.formulaOutput.classList.remove('hidden');

        try {
            const response = await fetch('/api/ai/generate-formula', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    product_type: productType,
                    base: base,
                    actives: activeIngredients
                }),
            });

            const responseText = await response.text();

            if (!response.ok) {
                let errorMsg = `Błąd serwera: ${response.status}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    errorMsg = responseText || errorMsg;
                }
                throw new Error(errorMsg);
            }
            
            let formulaFromAI;
            try {
                const data = JSON.parse(responseText);
                formulaFromAI = data.formula || "Nie otrzymano poprawnej receptury od AI.";
            } catch (e) {
                console.warn("Odpowiedź z backendu nie jest poprawnym JSON-em, wyświetlam jako tekst:", responseText);
                formulaFromAI = responseText || "Otrzymano nieoczekiwaną odpowiedź od serwera.";
            }
            DOMElements.formulaText.value = `Typ: ${productType}\nBaza: ${base}\nSkładniki Aktywne: ${activeIngredients.join(', ') || 'brak'}\n\nOdpowiedź AI:\n${formulaFromAI}`;

        } catch (error) {
            console.error("Błąd podczas generowania receptury AI:", error);
            DOMElements.formulaText.value = `${initialInfo}\nBŁĄD:\n${error.message}\nUpewnij się, że backend i Ollama działają poprawnie.`;
        }
    }
    
    function openModal(title, content) {
        DOMElements.modalTitle.innerText = title;
        DOMElements.modalBody.innerText = content; 
        DOMElements.modal.classList.remove('hidden');
        DOMElements.modal.classList.add('flex');
        setTimeout(() => {
            DOMElements.modalBackdrop.style.opacity = '1';
            DOMElements.modal.querySelector('.modal-content').style.transform = 'scale(1)';
        }, 10);
    }

    function closeModal() {
        DOMElements.modalBackdrop.style.opacity = '0';
        DOMElements.modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
        setTimeout(() => {
            DOMElements.modal.classList.add('hidden');
            DOMElements.modal.classList.remove('flex');
        }, 300);
    }
    
    function initApp() {
        initWizardConfig();
        renderCurrentWizardStep();
        setupAiCreator(); 

        DOMElements.wizard.addEventListener('click', (e) => {
            const choiceButton = e.target.closest('button[data-step-id]');
            const backButton = e.target.closest('#back-btn');
            const restartButton = e.target.closest('#restart-btn');
            const actionButton = e.target.closest('button[data-action]');

            if (choiceButton) {
                const { stepId, value } = choiceButton.dataset;
                AppState.userChoices[stepId] = value;
                
                const nextStepIndexCand = AppState.currentWizardStepIndex + 1;
                if (stepId === 'chceSkladnik' && value === 'Nie' && 
                    AppState.wizardStepsConfig[nextStepIndexCand]?.id === 'mainIngredients') {
                     AppState.currentWizardStepIndex += 2; 
                } else {
                    AppState.currentWizardStepIndex++;
                }
                renderCurrentWizardStep();
            } else if (backButton) {
                AppState.currentWizardStepIndex--;
                const stepToClearConfig = AppState.wizardStepsConfig[AppState.currentWizardStepIndex]; 
                if (stepToClearConfig) {
                    delete AppState.userChoices[stepToClearConfig.id];
                    
                    const mainIngredientsStepIndex = AppState.wizardStepsConfig.findIndex(s => s.id === 'mainIngredients');
                    if (mainIngredientsStepIndex !== -1 && AppState.currentWizardStepIndex < mainIngredientsStepIndex) {
                        if (AppState.userChoices['mainIngredients']) {
                            delete AppState.userChoices['mainIngredients'];
                        }
                    }
                }
                renderCurrentWizardStep();
            } else if (restartButton) {
                resetWizard();
            } else if (actionButton) {
                const { action, id } = actionButton.dataset;
                const product = AppState.products.find(p => p.id == id); 
                if (product && action === 'ingredients') {
                    const ingredientsText = product.ingredients || "Brak danych o składzie."; 
                    const formattedIngredients = ingredientsText.replace(/, /g, ',\n');
                    openModal(`Skład INCI: ${product.name}`, formattedIngredients);
                }
            }
        });

        DOMElements.closeModalBtn.addEventListener('click', closeModal);
        DOMElements.modalBackdrop.addEventListener('click', closeModal);
        DOMElements.mobileMenuButton.addEventListener('click', toggleMobileMenu);
        DOMElements.mobileMenu.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') toggleMobileMenu();
        });

        if (DOMElements.generateFormulaBtn) {
            DOMElements.generateFormulaBtn.addEventListener('click', generateAiFormula);
        } else {
            console.error("Generate Formula Button not found!");
        }
    }

    initApp();
});