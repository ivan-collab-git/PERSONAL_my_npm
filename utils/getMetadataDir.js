import fs from 'fs'
import path from 'path'

// It start from the last (with idx 0), then the penultimate, which is 1, and goes on (not all might have a valid date name, so this might only work for the last ones )
function getMetadataDirectoryFromRepoByReverseIdxDateNamed( repoPath, reverseIdx ){
    try{

        // Function to check if a string is a valid ISO 8601 timestamp
        let isValidISODate = (dateString) => {
            let date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
        };

        // Get just folders
        let folders = fs.readdirSync( repoPath ).filter( file => {
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

// The offset is a date that it is used as the last date of the array, any date further from there will be ignored, so if for example, you want
// to get the date before a date X, then you set X as an offset and reverseIdx = 0
async function getMetadataDirectoryFromGithubByReverseIdxDateNamed( octokit, { owner, repo, path: repoPath, branch }, reverseIdx, offset ){
    try{
        // Function to check if a string is a valid ISO 8601 timestamp
        let isValidISODate = (dateString) => {
            let date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
        };

        let fileList = await listRepoPath( octokit, { owner, repo, path: repoPath, branch } )

        // Get just folders
        let folders = fileList.filter( file => {
            return (file.type === "dir" && isValidISODate(file.name) )
        }).map( i => i.name );

        if( offset ) folders = folders.slice( 0, folders.indexOf( offset ) )

        let folder = folders.sort((a, b) => {
            return new Date(b).getTime() - new Date(a).getTime();
        })[ reverseIdx ];

        return path.join( repoPath, folder  )
    }catch(err){
        // An error could be because of the naming convention
        console.error("Error searching for folder.", err)
    }
}


async function listRepoPath(octokit, { owner, repo, path, branch }){
    try {
        let response = await octokit.repos.getContent({ owner, repo, path, ref: branch });
        if (Array.isArray(response.data)) {
            return response.data
        } else {
            throw new Error("The path is a file:", response.data.name);
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

export {
    getMetadataDirectoryFromRepoByReverseIdxDateNamed,
    getMetadataDirectoryFromGithubByReverseIdxDateNamed
}