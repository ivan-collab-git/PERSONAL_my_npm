import fs, { readdirSync } from 'fs'
import path from 'path'

// It start from the last (with idx 0), then the penultimate, which is 1, and goes on (not all might have a valid date name, so this might only work for the last ones )
export default function getMetadataDirectoryFromRepoByReverseIdxDateNamed( repoPath, reverseIdx ){
    try{

        // Function to check if a string is a valid ISO 8601 timestamp
        let isValidISODate = (dateString) => {
            let date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
        };

        // Get just folders
        let folders = readdirSync( repoPath ).filter( file => {
            let filePath = path.join( repoPath, file );
            return (fs.statSync(filePath).isDirectory() && isValidISODate(file) )
        });

        let folder = folders.sort((a, b) => {
            return new Date(b).getTime() - new Date(a).getTime();
        })[ reverseIdx ];

        return path.join( repoPath, folder  )

    }catch(err){
        // An error could be because of the naming convention
        console.error("Error searching for folder.", err)
    }
}