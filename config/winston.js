//winston을 이용해 log를 설정하는 파일
const winston = require('winston');

// winston.createLogger() 함수를 통해 logger를 생성
const logger = winston.createLogger({
    level : 'info',
    format : winston.format.json(),
    /*
        transports는 로그를 어디에 저장할지 설정하는 부분
        info 로그는 combined.log 파일에 저장하고, 로그 level이 error인 경우에는 error.log 파일에 저장
    */
     transports : [  
        new winston.transports.File({filename : 'logs/error.log', level : 'error'}),
        new winston.transports.File({filename : 'logs/combined.log'})
    ]
});

// production 모드로 실행하지 않은 경우 단순히 콘솔에만 간략한 포맷으로 출력하겠다고 명시
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format : winston.format.simple()
    }));
}

module.exports = logger