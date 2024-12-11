import fs from "fs"
import path from 'path'
import leven from 'leven'


function filterSarif( 
    parsedSarif,
    levenThresholdForRepeatedIssues,
    vulnerabilityWhitelistFilter,
    vulnerabilityBlacklistFilter,
    alreadyCheckedUniqueId,
    interestingUniqueIdsOnQueueNotFullyChecked,
    pathFilterRegex
){

    // any files have i.guid (also copied at i.properties.id),  which is a guid for the reported vuln itself, codeql doesn't have this, this 
    // id is necesssary to filter the repeated vulnerabilities, so i here i add a guid if it doesn't exists already
    parsedSarif.runs[0].results.forEach( (_,idx) => 
        !parsedSarif.runs[0].results[idx].id &&
        (parsedSarif.runs[0].results[idx].properties.id = `_temp_guid_${idx}_`) 
    )
    // snyk files have the i.properties.primaryFilePath, but not codeql, this just adds it from !i.locations[0].physicalLocation.artifactLocation.uri when
    // it doesn't exist
    parsedSarif.runs[0].results.forEach( (_,idx) => 
        !parsedSarif.runs[0].results[idx].primaryFilePath && 
        (parsedSarif.runs[0].results[idx].properties.primaryFilePath = parsedSarif.runs[0].results[idx].locations[0].physicalLocation.artifactLocation.uri) 
    )
    let issues = parsedSarif.runs[0].results.map( i => i.properties )
    console.log( "Initial number after exact hash filter: ", issues.length )

    // Filter by levenstein distance
    if( levenThresholdForRepeatedIssues ){
        let issueCopy = JSON.parse(JSON.stringify( issues ))
        let allRepeated = []
        for( let curIssue in issueCopy ){
            let repeated = issueCopy.map( (compIssue, idx) => {
                if( !compIssue.snippetText || !issueCopy[ curIssue ].snippetText ) return
                return (
                    compIssue.uniqueId === issueCopy[ curIssue ].uniqueId  ||
                    leven( issueCopy[ curIssue ].snippetText, compIssue.snippetText ) < levenThresholdForRepeatedIssues ? idx : -1
                )
            }).filter( i => i >= 0 )
            // Add the repeated array to the original issue
            issueCopy[curIssue].repeatedLevensteinInstancesIds = JSON.parse(JSON.stringify( repeated.map( i => issueCopy[ i ].uniqueId ) ))
            issueCopy[curIssue].verifyRepeatedSnippet = JSON.parse(JSON.stringify( repeated.map( i => issueCopy[ i ].snippetText ) ))
            // This'll take the first id and set it as the Levenstein idx for this run, that is, the uniqueId which will represent a match
            // amongst levenstein matches. So all of the matches will have the same levensteinIdx as its id for this run (this is not accross runs)
            issueCopy[curIssue].levensteinIdx = issueCopy[curIssue].repeatedLevensteinInstancesIds.sort()[0]
            allRepeated.push( repeated )
            //console.log( repeated.map( i => issueCopy[i].snippetText ) )
        }
        // just take the first repeated of all repeated arrays and make them unique
        let uniqueLevensteinIdxs = Array.from(new Set(allRepeated.map( i => i.sort()[0] ).sort())).sort()
        
        //issues.map( ( i,idx ) =>  )
        issues = issueCopy.filter( ( i,idx ) => uniqueLevensteinIdxs.includes( idx ) )
        issues.forEach( i => { 
            if( i.repeatedLevensteinInstancesIds.length === 1 ){
                delete i.repeatedLevensteinInstancesIds
                //delete i.verifyRepeatedSnippet
            }
            else i.repeatedLevensteinInstances = i.repeatedLevensteinInstancesIds.length
        })
        console.log( `Number after levenstein filter with treshold ${levenThresholdForRepeatedIssues}:` , issues.length )
    }
    //console.log( issues )

    let filteredLevensteinIdxsIds = []

    issues = issues.filter( i => { 
        let filter =  (
            i.repeatedOccuranceId === 1 &&
            !vulnerabilityBlacklistFilter.includes( i.name ) &&
            !alreadyCheckedUniqueId.includes( i.uniqueId ) &&
            
            !interestingUniqueIdsOnQueueNotFullyChecked.includes( i.uniqueId ) &&
            (vulnerabilityWhitelistFilter.length ? vulnerabilityWhitelistFilter.includes(  i.name ) : true ) &&
            !pathFilterRegex.find( j => new RegExp(j).test( i.primaryFilePath ) )
        )

        if (!filter) filteredLevensteinIdxsIds.push( i.levensteinIdx )

        return filter
    })

    // This will filter all of the issues that have the same levenstein index id of an object that have been filter by the custom filters
    issues = issues.filter( i => !filteredLevensteinIdxsIds.includes( i.levensteinIdx ) )

    //issues = issues.sort((a,b) => b.metadata.priorityScore - a.metadata.priorityScore )
    issues = issues.sort((a,b) => (a.repeatedLevensteinInstancesIds?.length || 0) - (b.repeatedLevensteinInstancesIds?.length || 0)  )
    
    console.log( "Finall count after applying filters:", issues.length )

    let issuesGuids = issues.map( i => i.id )
    parsedSarif.runs[0].results = parsedSarif.runs[0].results.filter( i => issuesGuids.includes( i.properties.id )  )

    // This will add the list of snippets that are considered matches in the levenstein test, so you can see them in the sarif file just to verify 
    parsedSarif.runs[0].results.forEach( i => {
        i.properties.verifyRepeatedSnippet = issues.find( j => i.properties.id === j.id )?.verifyRepeatedSnippet
        i.properties.verifyRepeatedSnippet = i.properties.verifyRepeatedSnippet.map( k =>  k.replace(/\n/g, "\\n") )
    })

    return parsedSarif
}


function mergeSarifs( parsedSarifsArray ){
    
    // Create a new SARIF object
    let mergedSarif = {
      $schema: "https://json.schemastore.org/sarif-2.1.0",
      version: "2.1.0",
      runs: []
    };
    
    // Merge the `runs` arrays
    parsedSarifsArray.forEach(sarif => {
      if (sarif.runs) {
        mergedSarif.runs = mergedSarif.runs.concat(sarif.runs);
      }
    });
    
    return mergedSarif
    
}


export { mergeSarifs, filterSarif }