// Receive an array of arrays of words, where each array might represent a path, subdomain, collection of parameter keys or parameter values,
// and ranks positionwise, which word appeared more. For example, for subdomains, the word that appears the most will usually be .com
function rankMatrix( arrays ){
    let largestArray = 0
    arrays.forEach( arr => { if(arr.length > largestArray){ largestArray = arr.length } } )
    let inverseMatrix = []
    console.log(new Date(), `Calculating matrix with length ${largestArray}`)
    for( let i=0; i <= largestArray ; i++){
        inverseMatrix.push( arrays.map( arr => arr[i] ) )
    }
    return inverseMatrix.map( arr =>  rankWords(arr) )
}
// receives an array of words, with repeated words and returns an array with entries that describe the times a word repeated 
//{ repetitions: 9, word: 'hi', idx: 28 }

function rankWords(arr){
    let uniqueWords = Array.from( new Set( arr ) )
    let rank = []
    uniqueWords.forEach( word =>  rank.push({ repetitions: arr.filter( name => word === name ).length, word }) )
    rank = rank.sort((a,b) =>  b.repetitions - a.repetitions ).map( (obj,idx) => {return { ...obj, idx }})
    return rank
}


export { rankMatrix, rankWords }