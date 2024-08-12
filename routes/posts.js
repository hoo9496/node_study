const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const multer = require("multer");
const cloudinary = require("cloudinary");
const router = express.Router();
const sanitize = require('sanitize-html'); // 보안 관련 모듈

/* Multer setup */
// multer는 텍스트 정보를 저장하는 body 객체와 멀티파트 데이터를 저장하는 file 객체를 req 객체에 추가해주게 됨.
const storage = multer.diskStorage({    // 저장 경로와 파일명 처리 메서드
    // cloudinary 모듈을 사용해서 파일을 저장할 것이므로 저장 경로는 따로 설정하지 않고 filename만 설정
    // diskStorage() 메서드의 인자로 객체를 보내주었는데 filename 이라는 키 값은 함수이며 이 함수의 인자인 callback을 통해 전송된 파일명을 설정함.
    filename: (req, file, callback) => {
        callback(null, Date.now() + file.originalname);
    }
});

const imageFilter = (req, file, callback) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {   // 파일의 확장자 확인
        return callback(new Error("Only image files are allowed!"), false); // 메시지와 함께 오류 객체를 담은 콜백 함수를 반환
    }
    callback(null, true);
};

// upload 변수에 multer의 인스턴스를 생성 (storage 옵션 : 파일이 저장될 위치, fileFilter 옵션 : 어떤 파일을 허용할지 제어)
const upload = multer({ storage: storage, fileFilter: imageFilter });

/* Cloudinary setup */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

/* Middleware */
// 로그인하지 않은 사용자를 체크하는 미들웨어 - 필요한 라우터에 인자로 넣어 로그인이 필요한 동작(프로필 조회, 친구 추가 등)을 할 경우 로그인 했는지를 확인하는 역할
const isLoggedIn = (req, res, next) => {
    console.log("posts로그인 체크...");
    if (req.isAuthenticated()) {
        return next();
    }
    req.flash("error", "로그인이 필요합니다.");
    res.redirect("/user/login");
};

/* Routers */
router.get("/", isLoggedIn, (req, res) => {
    User.findById(req.user._id) // 친구들의 게시글
        .populate({
            path: "friends",
            populate: {
                path: "posts",
                model: "Post"
            }
        })
        .populate("posts") // 현재 사용자의 게시글
        .exec((err, user) => {
            if (err) {
                console.log("err : " + err);
                req.flash("error", "모든 게시물을 찾는 중에 오류가 발생했습니다.");
                res.render("posts/index");
            } else {
                let posts = [];
                for (var i = 0; i < user.friends.length; i++) {
                    console.log("user :: " + user);
                    console.log("user.friends :: " + user.friends);
                    for (var j = 0; j < user.friends[i].posts.length; j++) {
                        console.log("user.friends[i].posts :: " + user.friends[i].posts[j]);
                        posts.push(user.friends[i].posts[j]);
                    }
                }
                for (var i = 0; i < user.posts.length; i++) {
                    console.log("user.posts :: " + user.posts[i]);
                    posts.push(user.posts[i]);
                }
                if (posts) {
                    res.render("posts/index", {
                        posts: posts
                    });
                } else {
                    res.render("posts/index", { posts: null });
                }
            }
        });
});

router.get("/post/:id/like", isLoggedIn, (req, res) => {
    User.findById(req.user._id, (userErr, user) => {
        if (userErr) {
            console.log("userErr :: " + userErr);
            req.flash("이 게시물에 좋아요를 누르는 중에 오류가 발생했습니다. 로그인 하셨나요?");
            rse.redirect("back");
        } else {
            Post.findById(req.params.id, (postErr, post) => {
                if (postErr) {
                    console.log("postErr :: " + postErr);
                    req.flash("이 게시물에 좋아요를 누르는 중에 오류가 발생했습니다. 올바른 URL을 입력하셨나요?");
                    res.redirect("back");
                } else {
                    for (let i = 0; i < user.liked_posts.length; i++) { // 이미 좋아요 했는지 체크
                        console.log("user.liked_posts[i] :: " + user.liked_posts[i]);
                        if (user.liked_posts[i].equals(post._id)) {
                            req.flash("error", "이미 이 게시물에 좋아요를 표시했습니다.");
                            return res.redirect("back");
                        }
                    }
                    post.likes = post.likes + 1; // 좋아요
                    post.save();
                    user.liked_posts.push(post._id);
                    user.save();
                    req.flash("success", `${post.creator.firstName} 게시물에 좋아요를 표시했습니다.`);
                    res.redirect("back");
                }
            });
        }
    });
});

router.get("/post/:postid/comments/:commentid/like", isLoggedIn, (req, res) => {
    User.findById(req.user._id, (userErr, user) => {
        if (userErr) {
            console.log("userErr :: " + userErr);
            req.flash("error", "이 게시물에 좋아요를 표시하는 중에 오류가 발생했습니다.");
            res.redirect("back");
        } else {
            Comment.findById(req.params.commentid, (commentErr, comment) => {
                if (commentErr) {
                    console.log("commentErr :: " + commentErr);
                    req.flash("error", "댓글을 찾는 동안 오류가 발생했습니다. URL이 정확합니까?");
                    res.redirect("back");
                } else {
                    comment.likes = comment.likes + 1;
                    comment.save();
                    user.liked_comments.push(comment._id);
                    user.save();
                    req.flash("success", `${comment.creator.firstName}님 댓글에 좋아요를 표시했습니다.`);
                    res.redirect("back");
                }
            });
        }
    });
});

router.get("/post/new", isLoggedIn, (req, res) => {
    res.render("posts/new");
});

router.post("/post/new", isLoggedIn, upload.single("image"), (req, res) => {
    if (req.body.content) {
        let newPost = {};
        if (req.file) {
            /* cloudinary의 uploader.upload() 메서드를 이용해서 받은 파일(req.file)을 업로드하고
               새로운 게시글을 담을 newPost 객체에 image, creator, time, likes, content 속성을 입력해준 뒤 
               createPost()를 통해 새로운 Post를 하나 생성
            */
            cloudinary.uploader.upload(req.file.path, result => {
                newPost.image = result.secure_url;
                newPost.creator = req.user;
                newPost.time = new Date();
                newPost.likes = 0;
                // sanitize 모듈은 XSS공격, 즉 사용자의 input에 <script>를 사용해 악의적인 접근을 할 수 없도록 input에서 받은 내용에서 <script>를 걸러주는 역할
                newPost.content = sanitize(req.body.content);
                return createPost(newPost, req, res);
            });
        } else {
            newPost.image = null;
            newPost.creator = req.user;
            newPost.time = new Date();
            newPost.likes = 0;
            newPost.content = sanitize(req.body.content);
            return createPost(newPost, req, res);
        }
    }
});

function createPost(newPost, req, res) {
    Post.create(newPost, (err, post) => {
        if (err) {
            console.log("err :: " + err);
        } else {
            req.user.posts.push(post._id);
            req.user.save();
            res.redirect("/");
        }
    });
}

router.get("/post/:id", isLoggedIn, (req, res) => {
    Post.findById(req.params.id)
        .populate("comments")
        .exec((err, post) => {
            if (err) {
                console.log("err :: " + err);
                req.flash("error", "이 게시물을 찾는 중에 오류가 발생했습니다.");
                res.redirect("back");
            } else {
                res.render("posts/show", { post: post });
            }
        });
});

router.post("/post/:id/comments/new", isLoggedIn, (req, res) => {
    Post.findById(req.params.id, (err, post) => {
        if (err) {
            console.log("err :: " + err);
            req.flash("error", "댓글을 게시하는 중에 오류가 발생했습니다.");
            res.redirect("back");
        } else {
            Comment.create({ content: req.body.content }, (err, comment) => {
                if (err) {
                    console.log("err :: " + err);
                    req.flash("error", "댓글을 게시하는 중에 문제가 발생했습니다.");
                    res.redirect("back");
                } else {
                    comment.creator._id = req.user._id;
                    comment.creator.firstName = req.user.firstName;
                    comment.creator.lastName = req.user.lastName;
                    comment.likes = 0;
                    comment.save();
                    post.comments.push(comment);
                    post.save();
                    req.flash("success", "댓글이 성공적으로 게시되었습니다.");
                    res.redirect("/post/" + post._id);
                }
            });
        }
    });
});

module.exports = router;
