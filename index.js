const express = require('express')
const cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json())





const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.password}@cluster0.hwuf8vx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // databse and collection
    const DB = client.db('ForumsDB');

    const postCollection = DB.collection('post');
    const announcmentCollection = DB.collection('announcmemt');
    const tagCollection = DB.collection('tag');
    const userCollection = DB.collection('user');
    const commentsCollection = DB.collection('comments')
    const paymentCollection = DB.collection('payments')
    const membershipCollection = DB.collection('membership')




    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({ error: "Unauthorized access: No token" });
      }

      const token = authHeader.split(" ")[1];

      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          return res.status(403).send({ error: "Forbidden: Invalid token" });
        }

       req.decoded = decoded; // store decoded info (email, id, etc.)
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email }
      const user = await userCollection.findOne(query);
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }




    // jwt token post

    app.post('/api/jwt', async (req, res) => {
      const user = req.body;
      if (!user || !user.email) {
        return res.status(400).send({ error: 'Email is required' });
      }
      try {
        const token = jwt.sign(
          { email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        res.send({ token });
      } catch (err) {
        res.status(500).send({ error: 'Failed to generate token' });
      }
    });




    // Get user role by email
    app.get('/api/user/role', verifyToken, async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res.status(400).send({ error: 'Email is required' });
      }
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }
        res.send({ role: user.role || 'user' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to get user role' });
      }
    });

    // Store user in database only if not already present
    app.post('/api/users', async (req, res) => {
      const { email, name, image } = req.body;
      if (!email) {
        return res.status(400).send({ error: 'Email is required' });
      }
      try {
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(200).send({ message: 'User already exists' });
        }
        const newUser = {
          email,
          name,
          image,
          isMember: false,
          role: 'user',
          badge: 'Bronze'
        };
        await userCollection.insertOne(newUser);
        res.status(201).send({ message: 'User created' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to create user' });
      }
    });

    app.get('/api/membership', async (req, res) => {
      try {

        const { email } = req.query

        const result = await userCollection.findOne({ email: email })

        res.send(result.isMember)

      } catch (error) {
        console.log(error);
        res.send('internal server error')
      }
    })

    //  post api add post get post update vote downVote




    app.post("/api/posts", verifyToken, async (req, res) => {
      const { email, author, title, description, tag } = req.body;




      const newPost = {
        author,
        title,
        description,
        tag,
        createdAt: new Date(),
        upVote: 0,
        downVote: 0,
      };

      await postCollection.insertOne(newPost);
      res.send({ message: "Post created" });
    });

app.get('/api/posts', async (req, res) => {
  const { page = 1, tag, sort = 'latest' } = req.query;
  const limit = 5;
  const skip = (parseInt(page) - 1) * limit;

  const query = tag ? { tag: { $regex: tag, $options: "i" } } : {};

  try {
    let posts;

    
    if (sort === 'popular') {
      posts = await postCollection.aggregate([
        { $match: query },
        {
          $addFields: {
            voteScore: { $subtract: ['$upVote', '$downVote'] }
          }
        },
        { $sort: { voteScore: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]).toArray();
    } else {
     
      posts = await postCollection.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    }

    res.send(posts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});





    // Get posts by user email, sorted by date, with optional limit
    app.get('/api/posts-by-user', verifyToken, async (req, res) => {
      const { email, limit = 3 } = req.query;

      if (!email) {
        return res.status(400).send({ error: 'Email is required' });
      }
      try {
        const posts = await postCollection
          .find({ "author.email": email })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .toArray();
        res.send(posts);

      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch user posts' });
      }
    });

    app.get('/api/posts-count', async (req, res) => {
      const { tag } = req.query;
      const query = tag ? { tag: { $regex: tag, $options: 'i' } } : {};

      try {
        const count = await postCollection.countDocuments(query);
        res.send({ count });
      } catch (err) {
        res.status(500).send({ error: 'Failed to count posts' });
      }
    });



    app.get('/api/user-post-count', verifyToken, async (req, res) => {
      const { email } = req.query;
      const count = await postCollection.countDocuments({ 'author.email': email });
      res.send({ count });
    });



    // Get post details by ID
    app.get('/api/posts/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const post = await postCollection.findOne({ _id: new ObjectId(id) });
        if (!post) {
          return res.status(404).send({ error: 'Post not found' });
        }
        res.send(post);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch post details' });
      }
    });



    // vote system
    app.patch("/api/posts/:id/vote", verifyToken, async (req, res) => {
      const { id } = req.params;
      const { email, type } = req.body; // type: "up" or "down"

      const post = await postCollection.findOne({ _id: new ObjectId(id) });

      const alreadyVoted = post.votes?.find(vote => vote.email === email);

      if (alreadyVoted) {
        return res.status(400).send({ error: "You have already voted on this post" });
      }

      const updateFields = {
        $push: { votes: { email, type } },
        $inc: type === "up" ? { upVote: 1 } : { downVote: 1 }
      };

      await postCollection.updateOne({ _id: new ObjectId(id) }, updateFields);

      res.send({ message: "Vote submitted successfully" });
    });




    // my post

    app.get('/api/my-posts', verifyToken, async (req, res) => {
      const { email } = req.query;
      try {
        const posts = await postCollection.find({ "author.email": email }).toArray();
        res.send(posts);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch posts" });
      }
    });


    app.delete('/api/posts/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        const result = await postCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to delete post" });
      }
    });


    app.get('/api/comments', async (req, res) => {


      try {
        const comments = await commentsCollection.find().toArray();
        res.send(comments);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch comments" });
      }
    });

    app.patch('/api/comments/report/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { feedback, reporterEmail } = req.body;

      try {
        const result = await commentsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              isReported: true,
              feedback,
              reporterEmail,
            }
          }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to report comment" });
      }
    });








    //announcement
    app.get('/api/announcements', async (req, res) => {
      try {
        const announcements = await announcmentCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(announcements);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch announcements' });
      }
    });

    app.post('/api/announcements', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const announcmemtData = req.body

        if (!announcmemtData) {
          return res.status(401).send({ message: "announcements form no fillup" })
        }

        const result = await announcmentCollection.insertOne(announcmemtData)
        res.status(200).send(result)
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch announcements' });
      }
    })







    // create a comment collections

    // Add a comment to a post
    app.post('/api/comments', verifyToken, async (req, res) => {
      const { postId, email, text } = req.body;
      if (!postId || !email || !text) {
        return res.status(400).send({ error: 'postId, email, and text are required' });
      }
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ error: 'User not found' });
        }
        const comment = {
          postId: new ObjectId(postId),
          email,
          name: user.name,
          image: user.image,
          text,
          createdAt: new Date()
        };
        await commentsCollection.insertOne(comment);
        res.status(201).send({ message: 'Comment added' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to add comment' });
      }
    });











    // Add a new tag
    app.post('/api/tags', verifyToken, verifyAdmin, async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).send({ error: 'Tag name is required' });
      }
      try {
        const existingTag = await tagCollection.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existingTag) {
          return res.status(200).send({ message: 'Tag already exists' });
        }
        const result = await tagCollection.insertOne({ name });
        res.status(201).send(result)
      } catch (err) {
        res.status(500).send({ error: 'Failed to create tag' });
      }
    });

    // Get all tags
    app.get('/api/tags', async (req, res) => {
      try {
        const tags = await tagCollection.find().toArray();
        res.status(200).send(tags);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch tags' });
      }
    });


    // Create a new membership
    app.post('/api/memberships', async (req, res) => {
      const { name, price, features, currency = "USD", status = "active" } = req.body;
      if (!name || !price || !features) {
        return res.status(400).send({ error: 'Name, price, and features are required' });
      }
      try {
        const existing = await membershipCollection.findOne({ name });
        if (existing) {
          return res.status(409).send({ error: 'Membership already exists' });
        }
        const membership = {
          name,
          price,
          features,
          currency,
          status,
          createdAt: new Date()
        };
        await membershipCollection.insertOne(membership);
        res.status(201).send({ message: 'Membership created' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to create membership' });
      }
    });

    // Get all memberships
    app.get('/api/memberships', async (req, res) => {
      try {
        const memberships = await membershipCollection.find().toArray();
        res.status(200).send(memberships);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch memberships' });
      }
    });

    // Get membership by ID
    app.get('/api/memberships/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const membership = await membershipCollection.findOne({ _id: new ObjectId(id) });
        if (!membership) {
          return res.status(404).send({ error: 'Membership not found' });
        }
        res.status(200).send(membership);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch membership' });
      }
    });



    app.post("/api/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;

      if (!price) {
        return res.status(400).send({ error: "Price is required" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100), // Convert dollar to cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        console.error("Stripe error:", err);
        res.status(500).send({ error: "Payment creation failed" });
      }
    });


    app.put('/api/users/membership/:email', verifyToken, async (req, res) => {
      const { email } = req.params;
      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: { isMember: true, badge: 'golden' } }
        );
        res.send({ success: result.modifiedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: 'Failed to update membership status' });
      }
    });





    // admin control code 


    app.get('/api/counting', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const postCount = await postCollection.countDocuments()
        const userCount = await userCollection.countDocuments()
        const commentCount = await commentsCollection.countDocuments()

        res.status(200).send({ postCount, userCount, commentCount })
      } catch (error) {
        res.status(500).send({ error: 'Failed to update membership status' });
      }
    })



    // GET: All users with pagination and search
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      const { page = 1, limit = 10, search = "" } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      try {
        const query = search
          ? { name: { $regex: search, $options: "i" } }
          : {};

        const users = await userCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        const total = await userCollection.countDocuments(query);

        res.send({ users, total });
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // PATCH: Make admin
    app.patch("/api/users/admin/:email", verifyToken, verifyAdmin, async (req, res) => {
      const { email } = req.params;
      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: { role: "admin" } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to make admin" });
      }
    });



    // get reported admin

    app.patch('/api/comments/:id/ignore', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;

      try {
        const result = await commentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $unset: { feedback: "" } } // remove feedback field
        );
        res.send({ message: "Report ignored", result });
      } catch (error) {
        res.status(500).send({ error: "Failed to ignore report" });
      }
    });





    // Delete comment
    app.delete('/api/comments/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      await commentsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ message: "Comment deleted" });
    });

    // warng
    app.patch('/api/users/warn/:email', verifyToken, verifyAdmin, async (req, res) => {
      const { email } = req.params;

      try {
        const result = await userCollection.updateOne(
          { email },
          { $set: { warned: true } }
        );
        res.send({ message: "User warned", result });
      } catch (err) {
        res.status(500).send({ error: "Failed to warn user" });
      }
    });



    app.get("/api/users/is-warned/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      try {
        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ warned: user.warned === true });
      } catch (err) {
        res.status(500).send({ error: "Failed to check warned status" });
      }
    });



    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('SERVER!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
