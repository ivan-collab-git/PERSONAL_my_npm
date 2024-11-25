// SET THE REGEX'S LISTS VALUES TO DEFAULT IF NON EXISTSENT
function parseRegexListsForYAML( list , delimiter, defaultValue){
    let parsedList = list.split( delimiter ).filter( i => i ).map( i => i.trim() )
    if( parsedList.length && parsedList[0]) return parsedList
    return defaultValue
}

function parseBooleanValueForYAML( value, defaultValue ){
    if( value?.toLowerCase() === "true" ) return true
    if( value?.toLowerCase() === "false" ) return false
    return defaultValue
}

export { parseBooleanValueForYAML, parseRegexListsForYAML }