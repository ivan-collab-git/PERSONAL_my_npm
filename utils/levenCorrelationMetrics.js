import leven from 'leven'

// A match is considered the smallest levenstein distance ...
export default function levenCorrelationMetrics( chunksA, chunksB ){
    let matchedValues = []
    let levenMatrix = []
    for( let chunkA of chunksA ){
        let levenCurrentArray = []
        for( let chunkB of chunksB ){
            levenCurrentArray.push( leven(chunkA, chunkB) )
        }
        levenMatrix.push( levenCurrentArray )
    }

    levenMatrix = levenMatrix.map( ( row ,rowIdx ) => ({ rowIdx, row: row.map( ( col, colIdx) => ({ colIdx, col }))}) )
    reduceMatrix( levenMatrix, matchedValues )

    let potentialMatches = matchedValues.map( i => ({ 
        chunkA: chunksA[i.matchIdxs[0]], 
        chunkB: chunksB[i.matchIdxs[1]], 
        distance: i.distance, 
        similarityQuotient: 1 - i.distance/chunksA[i.matchIdxs[0]].length
    }))

    let similarityQuotientArray = potentialMatches.map( i => i.similarityQuotient )
    let meanSimilarityQuotient = similarityQuotientArray.reduce((acc, cur) => { acc += cur;  return acc; }, 0 ) / similarityQuotientArray.length
    let stdvSimilarityQuotient = calculateStandardDeviation( similarityQuotientArray )
    
    
    return { potentialMatches, meanSimilarityQuotient, stdvSimilarityQuotient }
}

// This will remove the row j and the column i from a matrix (in which the match was the object AiBj)
function reduceMatrix( matrix, matchedValues ){
    let minIdx = findMinIndex( matrix )
    matchedValues.push({ matchIdxs: minIdx, distance: getMatrixValue(matrix, minIdx[0], minIdx[1]) })
    if( matrix.find( i => i ).row.length === 1 || matrix.length === 1 ) return
    matrix = deleteRowAndColumn( matrix, minIdx[0], minIdx[1] )
    reduceMatrix( matrix, matchedValues )
}

function findMinIndex(matrix) {
    let minValue = Infinity;
    let minIndex = [-1, -1]; // [row, col]
    for (let row of getRowIdx(matrix)) {
        for (let col of getColIdx(matrix, row)) {
            let curValue = getMatrixValue(matrix, row, col);
            if (curValue < minValue) {
                minValue = curValue
                minIndex = [row, col];
            }
        }
    }
    return minIndex;
}

function getColIdx(matrix, rowIdx){
    return matrix.find(i => i.rowIdx === rowIdx).row.map(i => i.colIdx)
}

function getRowIdx(matrix){
    return matrix.map(i => i.rowIdx)
}

function deleteRowAndColumn(matrix, rowIdx, colIdx){
    return matrix.filter( i => i.rowIdx !== rowIdx ).map( i => ({ ...i, row: i.row.filter( j => j.colIdx !== colIdx )}) )
}

function getMatrixValue(matrix, rowIdx, colIdx){
    return matrix.find( i => i.rowIdx === rowIdx ).row.find( j => j.colIdx === colIdx ).col
}

function calculateStandardDeviation(arr){
    let n = arr.length;
  
    // Calculate the mean (average)
    let mean = arr.reduce((acc, cur) => acc + cur, 0) / n;
  
    // Calculate variance
    let variance = arr.reduce((acc, cur) => acc + Math.pow(cur - mean, 2), 0) / n;
  
    // Standard deviation is the square root of the variance
    return Math.sqrt(variance);
}
