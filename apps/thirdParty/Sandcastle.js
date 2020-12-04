const Sandcastle = {};

Sandcastle.addButton = function(text, callback, parentId = "toolbar") {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = "ele-cls button-cls";
  button.onclick = callback;
  button.textContent = text;
  document.getElementById(parentId).appendChild(button);
  return button;
}
Sandcastle.addCheckButton = function(text, callback, parentId = "toolbar") {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = "ele-cls button-cls";
  checkbox.onclick = function() {
    callback(checkbox.checked)
  };
  checkbox.innerText = text;
  document.getElementById(parentId).appendChild(checkbox);
  return checkbox
}
Sandcastle.addLabel = function(text, parentId = "toolbar") {
  const label = document.createElement('label');
  label.type = 'label';
  label.className = "label-cls";
  label.innerText = text;
  document.getElementById(parentId).appendChild(label);
  return label
}
