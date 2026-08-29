function isModality(value) {
    return value === 'text' || value === 'image';
}
export function readImageInputChoice(model) {
    const input = model['input'];
    if (input === undefined)
        return 'auto';
    if (!Array.isArray(input))
        return 'invalid';
    if (input.length === 0)
        return 'auto';
    if (!input.every(isModality))
        return 'invalid';
    return input.includes('image') ? 'image' : 'text-only';
}
export function applyImageInputChoice(model, choice) {
    const next = { ...model };
    if (choice === 'auto')
        Reflect.deleteProperty(next, 'input');
    else
        next['input'] = choice === 'image' ? ['text', 'image'] : ['text'];
    return next;
}
export function applyImageInputChoiceToAll(models, choice) {
    return models.map(model => applyImageInputChoice(model, choice));
}
