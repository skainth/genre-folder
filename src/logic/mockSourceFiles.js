export const demoConfig = {
    source: '/sdcard/Music/Downloads',
    target: '/sdcard/Music/Sorted',
    allowedExtensions: ['mp3', 'wma', 'flac', 'wav', 'aac'],
    allowedExtentions: ['mp3', 'wma', 'flac', 'wav', 'aac'],
    genreToFolder: {
        Pop: ['Pop'],
        Rock: ['Rock'],
        'Hip-Hop': ['Hip-Hop'],
        Metal: ['Rock/Metal'],
        Others: 'Others',
    },
};

export function getMockSourceFiles() {
    return [
        {
            filepath: '/sdcard/Music/Downloads/Blinding Lights.mp3',
            ctime: 1721173000,
            mtime: 1721173000,
            metadata: {
                title: 'Blinding Lights',
                artist: ['The Weeknd'],
                genre: 'Pop',
                album: 'After Hours',
            },
        },
        {
            filepath: '/sdcard/Music/Downloads/Bohemian Rhapsody.mp3',
            ctime: 1721173040,
            mtime: 1721173040,
            metadata: {
                title: 'Bohemian Rhapsody',
                artist: ['Queen'],
                genre: 'Rock',
                album: 'A Night at the Opera',
            },
        },
        {
            filepath: '/sdcard/Music/Downloads/Lose Yourself.mp3',
            ctime: 1721173090,
            mtime: 1721173090,
            metadata: {
                title: 'Lose Yourself',
                artist: ['Eminem'],
                genre: 'Hip-Hop',
                album: '8 Mile',
            },
        },
        {
            filepath: '/sdcard/Music/Downloads/Hybrid Theory - Papercut.mp3',
            ctime: 1721173190,
            mtime: 1721173190,
            metadata: {
                title: 'Papercut',
                artist: ['Linkin Park'],
                genre: 'Rock/Metal',
                album: 'Hybrid Theory',
            },
        },
        {
            filepath: '/sdcard/Music/Downloads/Unknown Track.mp3',
            ctime: 1721173290,
            mtime: 1721173290,
            metadata: {
                title: 'Unknown Track',
                artist: ['Unknown Artist'],
                genre: '',
                album: 'Unknown Album',
            },
        },
        {
            filepath: '/sdcard/Music/Downloads/Broken File.flac',
            ctime: 1721173390,
            mtime: 1721173390,
            parseError: 'metadata parser failed',
        },
        {
            filepath: '/sdcard/Music/Downloads/Readme.txt',
            ctime: 1721173490,
            mtime: 1721173490,
            metadata: {
                title: 'Readme',
                artist: [],
                genre: '',
                album: '',
            },
        },
    ];
}
