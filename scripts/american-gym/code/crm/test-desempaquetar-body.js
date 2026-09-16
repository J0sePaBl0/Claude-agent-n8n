// Solo para pruebas: aplana el body del webhook al shape que
// entrega el Execute Workflow Trigger.
return [{ json: $input.first().json.body }];