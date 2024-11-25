import path from 'path'

function getPackedFileInfo( mappingTree, savedListing, hostName, urlPath, filePath ){
    let flatSavedListing = savedListing.map( i => i.sources.map( j => ({ hostName: i.hostName, sourceUrl: j.sourceUrl, files: j.files }) ) ).flat()

    let referencedBy = mappingTree.filter( i => i.filesMapped.includes( urlPath.substring(1) ) ).map( i  => i.referencedBy  ).flat().map( i => {
        let { hostname: hostName, pathname: urlPath } = new URL(i)
        let sourcesUrl = flatSavedListing.filter( i => i.hostName === hostName && i.files.includes( urlPath ) ).map( i => i.sourceUrl )
        return { [i]: sourcesUrl}
    })

    return referencedBy
}

// This will override the original message
function getPackedFiles( mappingTree, hostName, urlPath, filePath ){
    let bundledFiles = mappingTree.find( i  => {
        let {hostname, pathname} = new URL(i.referencedBy)
        return ( pathname === urlPath && hostname === hostName)
    })?.filesMapped

    return { [filePath]: bundledFiles }
}

function getSourceUrl( savedListing, hostName, urlPath, filePath ){
    let flatSavedListing = savedListing.map( i => i.sources.map( j => ({ hostName: i.hostName, sourceUrl: j.sourceUrl, files: j.files }) ) ).flat()
    
    let sourcesUrl = flatSavedListing.filter( i => i.hostName === hostName && i.files.includes( urlPath ) ).map( i => i.sourceUrl )

    return { [filePath]: sourcesUrl }
}

function addMetadataCrossReferenceToSarif( result, issues, savedListing, mappingTree, directoryPrefix = "" ){

    result.properties = issues.find( i => i.id === result.guid ) || {}

    let filePath = path.join( directoryPrefix, result.locations[0].physicalLocation.artifactLocation.uri )
    filePath = filePath.replace(/\.unpacked\/[^/]*$/, "")
    let hostName, urlPath, bundleSource, bundlePackedFiles, packedFileInfo
    if( /^transformed\/Script\//.test( filePath ) ){
        ({ hostname: hostName, pathname: urlPath } =  new URL ( "https://" + filePath.replace( /^transformed\/Script\//, "" )))
        bundleSource = getSourceUrl( savedListing, hostName, urlPath, filePath )
        bundlePackedFiles = getPackedFiles( mappingTree, hostName, urlPath, filePath )


        let bundleNames = Array.from(new Set([
            ...Object.keys( bundleSource ),
            ...Object.keys( bundlePackedFiles ),
          ]))

        result.message = {
            text: result?.message?.text,
            markdown: "This bundle is loaded in:{0}",
            arguments: [
                bundleNames.map( bundle => `${ bundleSource[bundle]?.map(  source => `\n- [${source}](${source})` ) } \n\nand loads the files\n ${ bundlePackedFiles[ bundle ]?.map(  file => `\n- [${file}](${file})` ) }`)
            ]
    
        }
    }
    else if( /^mapped\/Script\//.test( filePath ) ){
        ({ hostname: hostName, pathname: urlPath } =  new URL ( "https://" + filePath.replace( /^mapped\/Script\//, "" )))
        packedFileInfo = getPackedFileInfo( mappingTree, savedListing, hostName, urlPath, filePath )

        let bundleNames = packedFileInfo.map( i => Object.keys( i ) ).flat()
        
        result.message = {
            text: result?.message?.text,
            markdown: "This file is loaded by the bundles {0}", // This should give an object of the form {bundleName: [url1, url2, ...]}
            arguments: [
                bundleNames.map( bundle => `\n ${`[${bundle}](${bundle})`}, which was loaded by:\n\n ${ packedFileInfo.find( obj => Object.keys(obj)[0] === bundle )[bundle].map( source => `- [${source}](${source})` ).join("\n") } ` ).join("\n")
            ]
        }
    }
    result.message.text += `; ${result.properties.id}; ${result.properties.isNew ? "new finding; @@@" : "" }`
}

// Mark as repeated occurances and add number of repeated occurances
function addOccurancesCheck( properties ){
    let uniqueOcurrancesHashes = Array.from(new Set(properties.map( i => i.uniqueId )))
    let occuranceCount = uniqueOcurrancesHashes.map( i => {
        let count = properties.map( j => j.uniqueId ).filter( j => i === j ).length
        
        return { uniqueId:i, count, currentCount: 0 }
    })
    properties = properties.map( i => {
        let occurance = occuranceCount.find( j => j.uniqueId === i.uniqueId )
        occurance.currentCount ++
        return {...i, repeatedUniqueId: occurance.count, repeatedOccuranceId: occurance.currentCount }
    })
    return properties
}

export { addMetadataCrossReferenceToSarif, addOccurancesCheck }