export default function extractDateFromBucketName( bucketName ){
    let intermediateArr = bucketName.split("_")
    // (get the penultimate object, because if the COOKIE_CONTEXT... has a _ in its name, the positions will change)
    let extractionTime = intermediateArr[ intermediateArr.length - 2 ]

    if( !isValidDate( extractionTime ) ){ 
        throw new Error("Invalid bucket name provided. ISO string execution date not found, or is in incorrect position.")
    }

    console.log( "Extraction time: ", extractionTime )
    return extractionTime

    function isValidDate(dateString) {
        const date = new Date(dateString);
        return date.toISOString() === dateString;
    }
}
